import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import workerURL from '@ffmpeg/ffmpeg/worker?url';
import { WtopError, type MethodContext } from '@wtop/provider';

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm';
const CORE_BASE_FALLBACK = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm';

type Ctx = MethodContext | undefined;

let ff: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let coreCache: { coreURL: string; wasmURL: string } | null = null;
let queue: Promise<unknown> = Promise.resolve();

let lastLog = '';
let lastPercent = 0;
const logListeners = new Set<(line: string) => void>();

export function onLog(fn: (line: string) => void): () => void {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
}

async function fetchCore(ctx: Ctx): Promise<{ coreURL: string; wasmURL: string }> {
  if (coreCache) return coreCache;
  const report = (received: number, total: number, what: string) =>
    ctx?.reportProgress({
      percent: total ? Math.min(99, Math.round((received / total) * 100)) : undefined,
      text: `下载 ffmpeg ${what} ${(received / 1024 / 1024).toFixed(1)}MB`,
      stage: 'load',
    });
  for (const base of [CORE_BASE, CORE_BASE_FALLBACK]) {
    try {
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript', true, ({ received, total }) => report(received, total, 'core'));
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm', true, ({ received, total }) => report(received, total, 'wasm'));
      coreCache = { coreURL, wasmURL };
      return coreCache;
    } catch (e) {
      if (base === CORE_BASE_FALLBACK) {
        throw new WtopError('BUSINESS_ERROR', `ffmpeg core 下载失败（unpkg/jsdelivr 均不可达）: ${String(e instanceof Error ? e.message : e)}`);
      }
    }
  }
  throw new WtopError('BUSINESS_ERROR', 'ffmpeg core 下载失败');
}

async function load(ctx: Ctx): Promise<FFmpeg> {
  if (ff) return ff;
  if (loading) return loading;
  loading = (async () => {
    const { coreURL, wasmURL } = await fetchCore(ctx);
    const inst = new FFmpeg();
    inst.on('log', ({ message }) => {
      lastLog = message;
      for (const fn of logListeners) fn(message);
    });
    inst.on('progress', ({ progress }) => {
      lastPercent = Math.max(0, Math.min(99, Math.round(progress * 100)));
    });
    ctx?.reportProgress({ text: '初始化 ffmpeg…', stage: 'load' });
    await inst.load({ classWorkerURL: workerURL, coreURL, wasmURL });
    ff = inst;
    return inst;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** 真取消：terminate 杀死 wasm；实例置空，下次调用懒重载（blob 缓存秒级） */
function kill() {
  try { ff?.terminate(); } catch { /* 已死 */ }
  ff = null;
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

export interface RunOpts {
  args: string[];
  inputs?: { name: string; blob: Blob }[];
  output?: { name: string; mime: string };
  extraCleanup?: string[];
  ctx?: Ctx;
  /** probe 类：ffmpeg 无输出参数时退出码非 0 属预期 */
  allowFail?: boolean;
}

export interface RunResult { blob?: Blob; code: number; logs: string[] }

/** 互斥队列内完成 写入→exec→读取→清理 全流程；5s 心跳进度；abort→terminate */
export function runFF(opts: RunOpts): Promise<RunResult> {
  const { args, inputs = [], output, extraCleanup = [], ctx, allowFail } = opts;
  return enqueue(async () => {
    if (ctx?.signal.aborted) throw new WtopError('CANCELLED', '调用已取消');
    const inst = await load(ctx);
    const logs: string[] = [];
    const collect = (line: string) => { logs.push(line); if (logs.length > 400) logs.shift(); };
    const off = onLog(collect);
    lastPercent = 0;
    const heartbeat = setInterval(() => {
      ctx?.reportProgress({ percent: lastPercent, text: lastLog || '处理中', stage: 'exec' });
    }, 5000);
    const onAbort = () => kill();
    ctx?.signal.addEventListener('abort', onAbort, { once: true });
    const written: string[] = [];
    try {
      for (const f of inputs) {
        if (f.blob.size > 150 * 1024 * 1024) {
          ctx?.logger.warn(`输入 ${(f.blob.size / 1024 / 1024).toFixed(0)}MB 超过 150MB，wasm 内存（~2GB 上限）可能不足`);
          ctx?.reportProgress({ text: '⚠ 大文件：可能触发内存上限', stage: 'exec' });
        }
        await inst.writeFile(f.name, new Uint8Array(await f.blob.arrayBuffer()));
        written.push(f.name);
      }
      ctx?.reportProgress({ percent: 0, text: `ffmpeg ${args.join(' ')}`.slice(0, 200), stage: 'exec' });
      const code = await inst.exec(args);
      if (ctx?.signal.aborted) throw new WtopError('CANCELLED', '调用已取消');
      if (code !== 0 && !allowFail) {
        throw new WtopError('BUSINESS_ERROR', `ffmpeg 退出码 ${code}`, { logs: logs.slice(-30) });
      }
      let blob: Blob | undefined;
      if (output) {
        const data = await inst.readFile(output.name);
        if (typeof data === 'string' || !data.byteLength) {
          throw new WtopError('BUSINESS_ERROR', `输出文件 ${output.name} 为空`, { logs: logs.slice(-30) });
        }
        blob = new Blob([new Uint8Array(data)], { type: output.mime });
      }
      return { blob, code, logs };
    } catch (e) {
      if (ctx?.signal.aborted) throw new WtopError('CANCELLED', '调用已取消');
      if (e instanceof WtopError) throw e;
      kill();
      throw new WtopError('BUSINESS_ERROR', `ffmpeg 执行失败: ${String(e instanceof Error ? e.message : e)}`, { logs: logs.slice(-30) });
    } finally {
      clearInterval(heartbeat);
      ctx?.signal.removeEventListener('abort', onAbort);
      off();
      for (const f of [...written, ...(output ? [output.name] : []), ...extraCleanup]) {
        try { await inst.deleteFile(f); } catch { /* 可能未写入 */ }
      }
    }
  });
}

export function extOf(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'mp4';
  if (blob.type.includes('matroska')) return 'mkv';
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('quicktime')) return 'mov';
  if (blob.type.includes('avi')) return 'avi';
  return 'bin';
}

/** atempo 单级仅支持 0.5–2，链式分解 */
export function atempoChain(factor: number): string {
  const parts: number[] = [];
  let f = factor;
  while (f > 2) { parts.push(2); f /= 2; }
  while (f < 0.5) { parts.push(0.5); f /= 0.5; }
  parts.push(f);
  return parts.map((v) => `atempo=${v.toFixed(4)}`).join(',');
}
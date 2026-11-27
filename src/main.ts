import { createProvider, type Manifest, type MethodContext } from '@wtop/provider';
import manifestJson from '../public/.well-known/wtop-manifest.json';
import * as ops from './ops';
import { onLog } from './ffmpeg';

const manifest = manifestJson as Manifest;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status');
const message = $('message');

const OPS = {
  probe: ops.probe, trim: ops.trim, transcode: ops.transcode, compress: ops.compress,
  frame: ops.frame, gif: ops.gif, extractAudio: ops.extractAudio, speed: ops.speed,
} as const;
type OpName = keyof typeof OPS;

let active: OpName = 'probe';
let inputBlob: Blob | null = null;
let outputBlob: Blob | null = null;
let inputUrl = '';
let outputUrl = '';
let running = false;
let uiAbort: AbortController | null = null;

const provider = createProvider({
  manifest,
  hostOrigins: [
    'https://recycle.msqt.fun',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5179',
    'http://127.0.0.1:5179',
  ],
  autoHandshake: false,
  mirror: {
    start: ({ method, params }) => {
      if (running) return; // 本地 UI 运行中让位
      setActiveTab(method as OpName);
      const p = params as { video?: Blob };
      if (p.video instanceof Blob) setVideoInput(p.video);
      showProgress(0, `HOST 调用 ${method}…`);
    },
    progress: ({ progress }) => { if (!running) showProgress(progress.percent, progress.text ?? ''); },
    result: ({ data }) => { if (!running) { render(data as Record<string, unknown>); showProgress(100, '完成'); } },
    error: ({ error }) => { if (!running) { message.textContent = `[${error.code}] ${error.message}`; message.classList.add('err'); showProgress(0, '失败'); } },
    cancel: () => { if (!running) showProgress(0, '已取消'); },
  },
});
for (const [name, fn] of Object.entries(OPS)) {
  provider.registerMethod(name, async (p, ctx) => fn(p as never, ctx));
}

const logEl = $('log');
onLog((line) => {
  logEl.textContent += line + '\n';
  const lines = logEl.textContent.split('\n');
  if (lines.length > 300) logEl.textContent = lines.slice(-300).join('\n');
  logEl.scrollTop = logEl.scrollHeight;
});

const num = (id: string): number | undefined => {
  const v = $<HTMLInputElement>(id).value.trim();
  return v === '' ? undefined : Number(v);
};
const val = (id: string) => $<HTMLInputElement>(id).value;
const checked = (id: string) => $<HTMLInputElement>(id).checked;

function requireVideo(): Blob {
  if (!inputBlob) throw new Error('请先选择视频');
  return inputBlob;
}

function collectParams(): unknown {
  switch (active) {
    case 'probe': return { video: requireVideo() };
    case 'trim': return { video: requireVideo(), start: num('tr-start') ?? 0, duration: num('tr-duration'), copy: checked('tr-copy') };
    case 'transcode': return { video: requireVideo(), format: val('tc-format'), crf: num('tc-crf'), preset: val('tc-preset') };
    case 'compress': return { video: requireVideo(), scale: val('cp-scale') || undefined, crf: num('cp-crf'), fps: num('cp-fps') };
    case 'frame': return { video: requireVideo(), time: num('fr-time') ?? 0, format: val('fr-format'), quality: num('fr-quality') };
    case 'gif': return { video: requireVideo(), start: num('gf-start'), duration: num('gf-duration'), fps: num('gf-fps'), width: num('gf-width') };
    case 'extractAudio': return { video: requireVideo(), format: val('ea-format') };
    case 'speed': return { video: requireVideo(), factor: num('sp-factor') ?? 2, keepAudio: checked('sp-keepaudio') };
  }
}

function fmtBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

function setVideoInput(blob: Blob) {
  inputBlob = blob;
  if (inputUrl) URL.revokeObjectURL(inputUrl);
  inputUrl = URL.createObjectURL(blob);
  $<HTMLVideoElement>('input-preview').src = inputUrl;
  $('input-meta').textContent = `${blob.type || '未知类型'} · ${fmtBytes(blob.size)}`;
}

function showProgress(percent: number | undefined, text: string) {
  $('progress-wrap').classList.remove('hidden');
  $('progress-bar').style.width = `${percent ?? 0}%`;
  $('progress-text').textContent = text;
}

function render(r: Record<string, unknown>) {
  outputBlob = null;
  $<HTMLTextAreaElement>('output-text').value = '';
  for (const id of ['output-video', 'output-image', 'output-audio']) $(id).classList.add('hidden');
  const blob = (r.video ?? r.image ?? r.audio) as Blob | undefined;
  if (blob instanceof Blob) {
    outputBlob = blob;
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    if (blob.type.startsWith('video/')) {
      const v = $<HTMLVideoElement>('output-video');
      v.src = outputUrl;
      v.classList.remove('hidden');
    } else if (blob.type.startsWith('image/')) {
      const img = $<HTMLImageElement>('output-image');
      img.src = outputUrl;
      img.classList.remove('hidden');
    } else {
      const a = $<HTMLAudioElement>('output-audio');
      a.src = outputUrl;
      a.classList.remove('hidden');
    }
    const dims = r.width !== undefined ? `${r.width}×${r.height} · ` : '';
    $('output-meta').textContent = `${dims}${blob.type} · ${fmtBytes(blob.size)}`;
    message.textContent = r.ratio !== undefined
      ? `压缩至原体积的 ${(Number(r.ratio) * 100).toFixed(1)}%（${fmtBytes(Number(r.originalSize))} → ${fmtBytes(blob.size)}）`
      : '完成';
  } else {
    $<HTMLTextAreaElement>('output-text').value = JSON.stringify(r, null, 2);
    $('output-meta').textContent = '探测结果';
    message.textContent = '完成';
    const card = $('probe-card');
    card.textContent = `${r.width}×${r.height} · ${Number(r.duration).toFixed(2)}s · ${r.videoCodec}${r.audioCodec ? ` + ${r.audioCodec}` : ''}`;
    card.classList.remove('hidden');
  }
  message.classList.remove('err');
}

async function run() {
  if (running) return;
  running = true;
  uiAbort = new AbortController();
  $('run').classList.add('hidden');
  $('cancel').classList.remove('hidden');
  logEl.textContent = '';
  showProgress(0, '准备…');
  const ctx: MethodContext = {
    callId: `ui-${Date.now()}`,
    sessionId: 'ui',
    visibility: true,
    signal: uiAbort.signal,
    meta: { tool: 'video-tool', method: active, attempt: 1 },
    logger: { debug: console.debug, info: console.info, warn: console.warn, error: console.error },
    reportProgress: (p: { percent?: number; text?: string }) => showProgress(p.percent, p.text ?? ''),
    requestHuman: async () => { throw new Error('UI 模式不支持人工确认'); },
    requestShow: async () => undefined,
    requestHide: async () => undefined,
  } as unknown as MethodContext;
  try {
    const params = collectParams();
    const r = await OPS[active](params as never, ctx) as Record<string, unknown>;
    render(r);
    showProgress(100, '完成');
  } catch (e) {
    message.textContent = e instanceof Error ? e.message : String(e);
    message.classList.add('err');
    showProgress(0, '失败');
  } finally {
    running = false;
    uiAbort = null;
    $('run').classList.remove('hidden');
    $('cancel').classList.add('hidden');
  }
}

function setActiveTab(op: OpName) {
  active = op;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === op));
  document.querySelectorAll('.op').forEach((el) => el.classList.toggle('hidden', (el as HTMLElement).dataset.op !== op));
  message.textContent = '';
}

$('tabs').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn?.dataset.tab) return;
  setActiveTab(btn.dataset.tab as OpName);
});

const drop = $('drop');
const fileInput = $<HTMLInputElement>('file');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) setVideoInput(fileInput.files[0]); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) setVideoInput(f);
});

$('run').addEventListener('click', () => void run());
$('cancel').addEventListener('click', () => uiAbort?.abort());
$('clear').addEventListener('click', () => {
  inputBlob = null;
  $<HTMLVideoElement>('input-preview').removeAttribute('src');
  $('input-meta').textContent = '未选择';
  $('probe-card').classList.add('hidden');
  fileInput.value = '';
});
$('download').addEventListener('click', () => {
  if (!outputBlob) { message.textContent = '没有可下载的产物'; message.classList.add('err'); return; }
  const ext = outputBlob.type.split('/')[1]?.split(';')[0]?.replace('x-matroska', 'mkv').replace('mpeg', 'mp3') ?? 'bin';
  const a = document.createElement('a');
  a.href = outputUrl;
  a.download = `video-tool-output.${ext}`;
  a.click();
});

const inIframe = window.parent !== window;
if (inIframe) {
  void provider.start();
  const timer = setInterval(() => {
    statusEl.textContent = `WTOP: ${provider.state}`;
    statusEl.dataset.state = provider.state;
    if (provider.state === 'ready' || provider.state === 'failed') clearInterval(timer);
  }, 200);
} else {
  statusEl.textContent = '独立模式';
  statusEl.dataset.state = 'idle';
}
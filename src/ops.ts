import { WtopError, type MethodContext } from '@wtop/provider';
import { runFF, extOf, atempoChain } from './ffmpeg';

const MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif',
  mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav', opus: 'audio/ogg',
};

function numCheck(v: unknown, name: string, min: number, max?: number): number {
  if (typeof v !== 'number' || Number.isNaN(v) || v < min || (max !== undefined && v > max)) {
    throw new WtopError('INVALID_INPUT', `${name} 需为 ${min}${max !== undefined ? `–${max}` : ' 以上'} 的数字`);
  }
  return v;
}

interface ProbeInfo {
  duration: number; width: number; height: number; videoCodec: string;
  audioCodec?: string; bitrate?: number; fps?: number;
}

/** ffmpeg.wasm 无 ffprobe：解析 `-i` 的 stderr 日志；直播录制的 webm 无 Duration 头 → null 解码兜底 */
function parseProbe(logs: string[]): ProbeInfo {
  const text = logs.join('\n');
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const video = /Stream #\d+:\d+.*: Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/.exec(text);
  if (!video) {
    throw new WtopError('INVALID_INPUT', '无法解析视频信息（不支持的格式或损坏文件）', { logs: logs.slice(-20) });
  }
  const audio = /Stream #\d+:\d+.*: Audio: (\w+)/.exec(text);
  const br = /bitrate: (\d+) kb\/s/.exec(text);
  const fps = /(\d+(?:\.\d+)?) fps/.exec(text);
  return {
    duration: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : NaN,
    width: Number(video[2]),
    height: Number(video[3]),
    videoCodec: video[1],
    audioCodec: audio?.[1],
    bitrate: br ? Number(br[1]) * 1000 : undefined,
    fps: fps ? Number(fps[1]) : undefined,
  };
}

function lastTime(logs: string[]): number {
  const times = [...logs.join('\n').matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const t = times[times.length - 1];
  return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0;
}

async function probeInner(video: Blob, ctx?: MethodContext): Promise<ProbeInfo> {
  const name = `in.${extOf(video)}`;
  const { logs } = await runFF({ args: ['-i', name], inputs: [{ name, blob: video }], ctx, allowFail: true });
  const info = parseProbe(logs);
  if (Number.isNaN(info.duration)) {
    const { logs: decLogs } = await runFF({
      args: ['-i', name, '-f', 'null', '-'], inputs: [{ name, blob: video }], ctx, allowFail: true,
    });
    info.duration = lastTime(decLogs);
  }
  return info;
}

export interface ProbeParams { video: Blob }
export async function probe(p: ProbeParams, ctx?: MethodContext) {
  const info = await probeInner(p.video, ctx);
  return { ...info, size: p.video.size };
}

export interface TrimParams { video: Blob; start: number; duration?: number; copy?: boolean }
export async function trim(p: TrimParams, ctx?: MethodContext) {
  const start = numCheck(p.start, 'start', 0);
  const duration = p.duration === undefined ? undefined : numCheck(p.duration, 'duration', 0.01);
  const inExt = extOf(p.video);
  const copy = (p.copy ?? true) && inExt !== 'bin';
  const inName = `in.${inExt}`;
  const outName = copy ? `out.${inExt}` : 'out.mp4';
  const args = [
    '-ss', String(start), '-i', inName,
    ...(duration !== undefined ? ['-t', String(duration)] : []),
    ...(copy ? ['-c', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac']),
    '-y', outName,
  ];
  const { blob } = await runFF({
    args, inputs: [{ name: inName, blob: p.video }],
    output: { name: outName, mime: copy ? (p.video.type || MIME.mp4) : MIME.mp4 }, ctx,
  });
  return { video: blob!, size: blob!.size };
}

export interface TranscodeParams { video: Blob; format: 'mp4' | 'webm' | 'mkv'; crf?: number; preset?: string }
export async function transcode(p: TranscodeParams, ctx?: MethodContext) {
  if (!['mp4', 'webm', 'mkv'].includes(p.format)) throw new WtopError('INVALID_INPUT', `不支持的格式: ${p.format}`);
  const crf = p.crf === undefined ? undefined : numCheck(p.crf, 'crf', 0, 51);
  const preset = p.preset ?? 'veryfast';
  const inName = `in.${extOf(p.video)}`;
  const outName = `out.${p.format}`;
  const vcodec = p.format === 'webm'
    ? ['-c:v', 'libvpx', '-b:v', '0', '-crf', String(crf ?? 30)]
    : ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf ?? 23)];
  const acodec = p.format === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
  const { blob } = await runFF({
    args: ['-i', inName, ...vcodec, ...acodec, '-y', outName],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: outName, mime: MIME[p.format] }, ctx,
  });
  return { video: blob!, size: blob!.size };
}

export interface CompressParams { video: Blob; scale?: string; crf?: number; fps?: number }
export async function compress(p: CompressParams, ctx?: MethodContext) {
  const crf = numCheck(p.crf ?? 28, 'crf', 18, 35);
  const fps = p.fps === undefined ? undefined : numCheck(p.fps, 'fps', 1, 60);
  if (p.scale !== undefined && !/^-?\d+:-?\d+$/.test(p.scale)) {
    throw new WtopError('INVALID_INPUT', `scale 格式应为 宽:高（如 1280:-2），收到: ${p.scale}`);
  }
  const inName = `in.${extOf(p.video)}`;
  const { blob } = await runFF({
    args: [
      '-i', inName,
      ...(p.scale ? ['-vf', `scale=${p.scale}`] : []),
      ...(fps !== undefined ? ['-r', String(fps)] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-c:a', 'aac', '-y', 'out.mp4',
    ],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: 'out.mp4', mime: MIME.mp4 }, ctx,
  });
  return {
    video: blob!, size: blob!.size, originalSize: p.video.size,
    ratio: p.video.size ? Math.round((blob!.size / p.video.size) * 1000) / 1000 : 1,
  };
}

export interface FrameParams { video: Blob; time: number; format?: 'png' | 'jpeg'; quality?: number }
export async function frame(p: FrameParams, ctx?: MethodContext) {
  const time = numCheck(p.time, 'time', 0);
  const format = p.format ?? 'png';
  const inName = `in.${extOf(p.video)}`;
  const outName = format === 'jpeg' ? 'out.jpg' : 'out.png';
  const q = p.quality === undefined ? 2 : Math.round((1 - p.quality) * 30) + 2;
  const { blob } = await runFF({
    args: ['-ss', String(time), '-i', inName, '-frames:v', '1', ...(format === 'jpeg' ? ['-q:v', String(q)] : []), '-y', outName],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: outName, mime: MIME[format] }, ctx,
  });
  const bmp = await createImageBitmap(blob!);
  const r = { image: blob!, width: bmp.width, height: bmp.height, size: blob!.size };
  bmp.close();
  return r;
}

export interface GifParams { video: Blob; start?: number; duration?: number; fps?: number; width?: number }
export async function gif(p: GifParams, ctx?: MethodContext) {
  const start = numCheck(p.start ?? 0, 'start', 0);
  const duration = numCheck(p.duration ?? 3, 'duration', 0.1, 10);
  const fps = Math.round(numCheck(p.fps ?? 10, 'fps', 1, 30));
  const width = Math.round(numCheck(p.width ?? 480, 'width', 16, 1920));
  const inName = `in.${extOf(p.video)}`;
  const filter = `[0:v] fps=${fps},scale=${width}:-1:flags=lanczos,split [a][b];[a] palettegen [p];[b][p] paletteuse`;
  const { blob } = await runFF({
    args: ['-ss', String(start), '-t', String(duration), '-i', inName, '-filter_complex', filter, '-y', 'out.gif'],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: 'out.gif', mime: MIME.gif }, ctx,
  });
  return { image: blob!, size: blob!.size };
}

export interface ExtractAudioParams { video: Blob; format: 'mp3' | 'aac' | 'wav' | 'opus' }
export async function extractAudio(p: ExtractAudioParams, ctx?: MethodContext) {
  const codecs: Record<string, string[]> = {
    mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
    aac: ['-c:a', 'aac'],
    wav: ['-c:a', 'pcm_s16le'],
    opus: ['-c:a', 'libopus'],
  };
  if (!codecs[p.format]) throw new WtopError('INVALID_INPUT', `不支持的音频格式: ${p.format}`);
  const inName = `in.${extOf(p.video)}`;
  const outName = `out.${p.format}`;
  const { blob } = await runFF({
    args: ['-i', inName, '-vn', ...codecs[p.format], '-y', outName],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: outName, mime: MIME[p.format] }, ctx,
  });
  return { audio: blob!, size: blob!.size };
}

export interface SpeedParams { video: Blob; factor: number; keepAudio?: boolean }
export async function speed(p: SpeedParams, ctx?: MethodContext) {
  const factor = numCheck(p.factor, 'factor', 0.25, 4);
  const keepAudio = p.keepAudio ?? true;
  const info = await probeInner(p.video, ctx);
  const withAudio = keepAudio && !!info.audioCodec;
  const inName = `in.${extOf(p.video)}`;
  const filter = withAudio
    ? `[0:v]setpts=PTS/${factor}[v];[0:a]${atempoChain(factor)}[a]`
    : `[0:v]setpts=PTS/${factor}[v]`;
  const { blob } = await runFF({
    args: [
      '-i', inName, '-filter_complex', filter,
      '-map', '[v]', ...(withAudio ? ['-map', '[a]', '-c:a', 'aac'] : ['-an']),
      '-c:v', 'libx264', '-preset', 'veryfast', '-y', 'out.mp4',
    ],
    inputs: [{ name: inName, blob: p.video }],
    output: { name: 'out.mp4', mime: MIME.mp4 }, ctx,
  });
  return { video: blob!, size: blob!.size };
}
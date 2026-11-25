import { WtopError, DEFAULTS } from '@wtop/types';
export function isFileRef(v) {
    return (v !== null && typeof v === 'object' &&
        typeof v.$wtopRef === 'string' &&
        v.$wtopRef.length > 0 &&
        (v.kind === 'blob-url' || v.kind === 'opfs'));
}
export function isWtopFile(v) {
    return ((typeof Blob !== 'undefined' && v instanceof Blob) ||
        v instanceof ArrayBuffer ||
        isFileRef(v));
}
export function fileSize(v) {
    if (typeof Blob !== 'undefined' && v instanceof Blob)
        return v.size;
    if (v instanceof ArrayBuffer)
        return v.byteLength;
    return v.size ?? 0;
}
/** 超过直传阈值抛 FILE_TOO_LARGE（v1.0 不支持引用传递，不静默截断） */
export function assertFileSize(v, threshold = DEFAULTS.largeFileThresholdBytes) {
    const size = fileSize(v);
    if (size > threshold) {
        throw new WtopError('FILE_TOO_LARGE', `文件 ${size} 字节超过直传阈值 ${threshold}（v1.0 不支持引用传递）`);
    }
}
/** 深度遍历参数树，对所有文件值做阈值检查 */
export function assertParamsFiles(params, threshold) {
    const seen = new Set();
    const walk = (v) => {
        if (v === null || typeof v !== 'object' || seen.has(v))
            return;
        seen.add(v);
        if (isWtopFile(v)) {
            assertFileSize(v, threshold);
            return;
        }
        if (Array.isArray(v)) {
            v.forEach(walk);
            return;
        }
        Object.values(v).forEach(walk);
    };
    walk(params);
}
/** 收集 Transferable（ArrayBuffer 零拷贝转移；Blob 结构化克隆） */
export function collectTransferables(params) {
    const out = [];
    const seen = new Set();
    const walk = (v) => {
        if (v === null || typeof v !== 'object' || seen.has(v))
            return;
        seen.add(v);
        if (v instanceof ArrayBuffer) {
            out.push(v);
            return;
        }
        if (Array.isArray(v)) {
            v.forEach(walk);
            return;
        }
        if (typeof Blob !== 'undefined' && v instanceof Blob)
            return;
        if (isFileRef(v))
            return;
        Object.values(v).forEach(walk);
    };
    walk(params);
    return out;
}
export function toFileRef(blob) {
    return {
        $wtopRef: URL.createObjectURL(blob),
        kind: 'blob-url',
        size: blob.size,
        mime: blob.type || undefined,
    };
}
/** v1.0 仅支持本端可解析的 blob-url 引用；跨沙箱不可解析时抛错（协议 §10 开放问题） */
export async function readFileRef(ref) {
    if (ref.kind !== 'blob-url') {
        throw new WtopError('BUSINESS_ERROR', `v1.0 不支持 ${ref.kind} 类型引用`);
    }
    try {
        const res = await fetch(ref.$wtopRef);
        return await res.blob();
    }
    catch {
        throw new WtopError('BUSINESS_ERROR', `无法解析 FileRef（跨沙箱 blob-url 不互通）: ${ref.$wtopRef}`);
    }
}
//# sourceMappingURL=files.js.map
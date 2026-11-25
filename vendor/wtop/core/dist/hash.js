/** 规范化 JSON：对象键按字典序递归排序，保证 hash 稳定 */
export function canonicalStringify(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(v) {
    if (Array.isArray(v))
        return v.map(sortKeys);
    if (v !== null && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).sort()) {
            const val = v[k];
            if (val !== undefined)
                out[k] = sortKeys(val);
        }
        return out;
    }
    return v;
}
export async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** manifestHash = 规范化 manifest JSON 的 SHA-256（hex），握手与漂移检测共用 */
export function manifestHash(manifest) {
    return sha256Hex(canonicalStringify(manifest));
}
export function randomId() {
    return globalThis.crypto.randomUUID();
}
//# sourceMappingURL=hash.js.map
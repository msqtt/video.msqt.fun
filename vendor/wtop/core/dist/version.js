import { PROTOCOL_VERSION, WtopError } from '@wtop/types';
export function parseVersion(v) {
    const m = /^(\d+)\.(\d+)$/.exec(v);
    if (!m)
        return null;
    return { major: Number(m[1]), minor: Number(m[2]) };
}
/** 协议 §5.3.2：主版本相同即兼容，取双方次版本较高者；主版本不同抛 VERSION_MISMATCH */
export function negotiateVersion(hostVersion = PROTOCOL_VERSION, providerVersion) {
    const h = parseVersion(hostVersion);
    const p = parseVersion(providerVersion);
    if (!h || !p) {
        throw new WtopError('VERSION_MISMATCH', `非法协议版本格式: host=${hostVersion} provider=${providerVersion}`);
    }
    if (h.major !== p.major) {
        throw new WtopError('VERSION_MISMATCH', `协议主版本不兼容: host=${hostVersion} provider=${providerVersion}`);
    }
    return `${h.major}.${Math.max(h.minor, p.minor)}`;
}
export function majorOf(v) {
    return parseVersion(v)?.major ?? null;
}
//# sourceMappingURL=version.js.map
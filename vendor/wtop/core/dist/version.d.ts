export interface ParsedVersion {
    major: number;
    minor: number;
}
export declare function parseVersion(v: string): ParsedVersion | null;
/** 协议 §5.3.2：主版本相同即兼容，取双方次版本较高者；主版本不同抛 VERSION_MISMATCH */
export declare function negotiateVersion(hostVersion: string | undefined, providerVersion: string): string;
export declare function majorOf(v: string): number | null;
//# sourceMappingURL=version.d.ts.map
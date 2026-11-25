import type { Manifest } from '@wtop/types';
/** 规范化 JSON：对象键按字典序递归排序，保证 hash 稳定 */
export declare function canonicalStringify(value: unknown): string;
export declare function sha256Hex(text: string): Promise<string>;
/** manifestHash = 规范化 manifest JSON 的 SHA-256（hex），握手与漂移检测共用 */
export declare function manifestHash(manifest: Manifest): Promise<string>;
export declare function randomId(): string;
//# sourceMappingURL=hash.d.ts.map
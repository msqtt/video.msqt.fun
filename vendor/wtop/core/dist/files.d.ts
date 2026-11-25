import { type FileRef, type WtopFile } from '@wtop/types';
export declare function isFileRef(v: unknown): v is FileRef;
export declare function isWtopFile(v: unknown): v is WtopFile;
export declare function fileSize(v: WtopFile): number;
/** 超过直传阈值抛 FILE_TOO_LARGE（v1.0 不支持引用传递，不静默截断） */
export declare function assertFileSize(v: WtopFile, threshold?: number): void;
/** 深度遍历参数树，对所有文件值做阈值检查 */
export declare function assertParamsFiles(params: unknown, threshold?: number): void;
/** 收集 Transferable（ArrayBuffer 零拷贝转移；Blob 结构化克隆） */
export declare function collectTransferables(params: unknown): Transferable[];
export declare function toFileRef(blob: Blob): FileRef;
/** v1.0 仅支持本端可解析的 blob-url 引用；跨沙箱不可解析时抛错（协议 §10 开放问题） */
export declare function readFileRef(ref: FileRef): Promise<Blob>;
//# sourceMappingURL=files.d.ts.map
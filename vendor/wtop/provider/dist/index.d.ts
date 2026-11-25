import { type Transport } from '@wtop/core';
import { type Logger, type Manifest, type MethodFn } from '@wtop/types';
export { WtopError, PROTOCOL_VERSION, SDK_VERSION } from '@wtop/types';
export type { Manifest, MethodContext, MethodFn, Progress, MethodMode, JSONSchema } from '@wtop/types';
export type ProviderState = 'idle' | 'handshaking' | 'ready' | 'failed';
export interface ProviderOptions {
    manifest: Manifest;
    hostOrigins: string[];
    autoHandshake?: boolean;
    handshakeTimeoutMs?: number;
    validateInput?: boolean;
    validateOutput?: boolean;
    logger?: Logger;
    /** 测试/devtools 注入；默认原生 postMessage → window.parent */
    transport?: Transport;
}
export interface Provider {
    readonly state: ProviderState;
    readonly sessionId: string | null;
    registerMethod<I = unknown, O = unknown>(name: string, fn: MethodFn<I, O>): void;
    start(): Promise<void>;
    dispose(): void;
    /** devtools 模拟人工完成（等价工具页面内 ctx.requestHide(result)） */
    completeHuman(callId: string, humanResult?: unknown): void;
}
export declare function createProvider(options: ProviderOptions): Provider;
//# sourceMappingURL=index.d.ts.map
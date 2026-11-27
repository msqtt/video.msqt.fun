import { type Transport } from '@wtop/core';
import { WtopError, type CancelReason, type Logger, type Manifest, type MethodFn, type Progress } from '@wtop/types';
export { WtopError, PROTOCOL_VERSION, SDK_VERSION } from '@wtop/types';
export type { Manifest, MethodContext, MethodFn, Progress, MethodMode, JSONSchema } from '@wtop/types';
export type ProviderState = 'idle' | 'handshaking' | 'ready' | 'failed';
/** UI 镜像事件：HOST 驱动的调用同步旁路给工具页自身 UI（流水线 preview），不走线上消息 */
export interface MirrorEventMap {
    start: {
        callId: string;
        method: string;
        params: unknown;
    };
    progress: {
        callId: string;
        method: string;
        progress: Progress;
    };
    result: {
        callId: string;
        method: string;
        data: unknown;
    };
    error: {
        callId: string;
        method: string;
        error: WtopError;
    };
    cancel: {
        callId: string;
        method: string;
        reason: CancelReason;
    };
}
export type MirrorHooks = {
    [K in keyof MirrorEventMap]?: (e: MirrorEventMap[K]) => void;
};
export interface ProviderOptions {
    manifest: Manifest;
    hostOrigins: string[];
    autoHandshake?: boolean;
    handshakeTimeoutMs?: number;
    validateInput?: boolean;
    validateOutput?: boolean;
    logger?: Logger;
    /** UI 镜像钩子；回调异常被隔离，不影响协议 */
    mirror?: MirrorHooks;
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
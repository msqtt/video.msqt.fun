export type Unsubscribe = () => void;
export type JSONSchema = Record<string, unknown>;
export interface Logger {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}
export declare const PROTOCOL_VERSION = "1.0";
export declare const SDK_VERSION = "1.0.0";
export interface Viewport {
    width: number;
    height: number;
}
export type MethodMode = 'headless' | 'hybrid' | 'interactive';
export interface MethodDef {
    name: string;
    displayName?: string;
    mode?: MethodMode;
    timeoutMs?: number;
    stateless?: boolean;
    input: JSONSchema;
    output: JSONSchema;
}
export interface Manifest {
    protocolVersion: string;
    name: string;
    displayName?: string;
    version: string;
    viewport?: Viewport;
    methods: MethodDef[];
}
export type ManifestInput = Omit<Manifest, 'protocolVersion' | 'methods'> & {
    protocolVersion?: string;
    methods: Record<string, Omit<MethodDef, 'name'>>;
};
export declare function defineManifest(m: ManifestInput): Manifest;
export interface FileRef {
    $wtopRef: string;
    kind: 'blob-url' | 'opfs';
    size?: number;
    mime?: string;
}
export type WtopFile = Blob | ArrayBuffer | FileRef;
export type ErrorCode = 'HANDSHAKE_FAILED' | 'VERSION_MISMATCH' | 'METHOD_NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_OUTPUT' | 'TIMEOUT' | 'HUMAN_TIMEOUT' | 'CANCELLED' | 'TOOL_CRASHED' | 'BUSINESS_ERROR' | 'FILE_TOO_LARGE' | 'INPUT_REQUIRED';
export declare const ERROR_CODES: readonly ErrorCode[];
export declare class WtopError extends Error {
    code: ErrorCode;
    details?: unknown;
    constructor(code: ErrorCode, message: string, details?: unknown);
}
export interface Envelope<T extends string, P> {
    wtop: string;
    type: T;
    sessionId?: string;
    callId?: string;
    payload: P;
}
export interface ReadyPayload {
    protocolVersion: string;
    manifestHash: string;
    nonce: string;
    toolName: string;
    sdkVersion?: string;
}
export interface AckPayload {
    sessionId: string;
    nonce: string;
    negotiatedVersion: string;
    hostOrigin: string;
}
export interface InvokePayload {
    method: string;
    params: unknown;
    timeoutMs?: number;
    attempt?: number;
}
export interface ResultPayload {
    data: unknown;
}
export interface ErrorPayload {
    code: ErrorCode;
    message: string;
    details?: unknown;
}
export interface ProgressPayload {
    percent?: number;
    text?: string;
    stage?: string;
    preview?: FileRef;
}
export type CancelReason = 'timeout' | 'human-timeout' | 'user' | 'engine' | 'crashed';
export interface CancelPayload {
    reason: CancelReason;
}
export interface RequestShowPayload {
    blocking: boolean;
    reason?: string;
}
export interface RequestHidePayload {
    humanResult?: unknown;
}
export interface VisibilityPayload {
    visible: boolean;
}
export interface PingPayload {
    ts: number;
}
export interface PongPayload {
    ts: number;
    echo: number;
}
export type WtopMessage = Envelope<'ready', ReadyPayload> | Envelope<'ack', AckPayload> | Envelope<'invoke', InvokePayload> | Envelope<'result', ResultPayload> | Envelope<'error', ErrorPayload> | Envelope<'progress', ProgressPayload> | Envelope<'cancel', CancelPayload> | Envelope<'ui.requestShow', RequestShowPayload> | Envelope<'ui.requestHide', RequestHidePayload> | Envelope<'ui.visibility', VisibilityPayload> | Envelope<'ping', PingPayload> | Envelope<'pong', PongPayload>;
export type MessageType = WtopMessage['type'];
export declare const CALL_LEVEL_TYPES: readonly MessageType[];
export type CallState = 'loading' | 'handshaking' | 'ready' | 'running' | 'waiting-human' | 'succeeded' | 'failed' | 'preserving' | 'cancelled' | 'destroyed';
export interface Progress {
    percent?: number;
    text?: string;
    stage?: string;
    preview?: FileRef;
}
export interface WaitingHumanInfo {
    reason?: string;
    blocking: boolean;
}
export interface MethodContext {
    readonly callId: string;
    readonly sessionId: string;
    readonly visibility: boolean;
    readonly signal: AbortSignal;
    readonly meta: {
        tool: string;
        method: string;
        attempt: number;
    };
    readonly logger: Logger;
    reportProgress(p: Progress): void;
    requestHuman(opts: {
        reason: string;
        blocking?: boolean;
    }): Promise<unknown>;
    requestShow(opts?: {
        reason?: string;
    }): void;
    requestHide(humanResult?: unknown): void;
    onCancel(cb: (reason: CancelReason) => void): Unsubscribe;
    onVisibility(cb: (visible: boolean) => void): Unsubscribe;
}
export type MethodFn<I = unknown, O = unknown> = (params: I, ctx: MethodContext) => Promise<O> | O;
export declare const DEFAULTS: {
    handshakeTimeoutMs: number;
    defaultTimeoutMs: number;
    humanTimeoutMs: number;
    preserveFailedMs: number;
    maxConcurrent: number;
    largeFileThresholdBytes: number;
    cancelGraceMs: number;
    heartbeatIntervalMs: number;
    heartbeatMissLimit: number;
    progressSilenceMs: number;
    viewport: Viewport;
};
export declare const MANIFEST_META_SCHEMA: JSONSchema;
//# sourceMappingURL=index.d.ts.map
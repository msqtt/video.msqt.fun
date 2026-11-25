import type { Logger, Unsubscribe, WtopMessage } from '@wtop/types';
export interface Transport {
    send(msg: WtopMessage, targetOrigin: string): void;
    onMessage(handler: (msg: WtopMessage, origin: string) => void): Unsubscribe;
    dispose(): void;
}
export declare function isWtopEnvelope(v: unknown): v is WtopMessage;
export interface PostMessageTransportOptions {
    /** 对端 window（provider 传 window.parent，host 传 iframe.contentWindow） */
    remote: Window | (() => Window | null);
    /** 对方 origin 白名单；收包强制校验，发包 targetOrigin 必须在其中 */
    allowedOrigins: string[];
    /**
     * 对端是 opaque origin（iframe sandbox 无 allow-same-origin）。
     * 此时收包 origin 恒为 'null'，改用 event.source === remote 严格鉴权；
     * 发包 targetOrigin 只能用 '*'——postMessage 指向特定 window 引用，
     * 消息仅投递给该 window，点对点场景下安全（协议 §9.1）。
     */
    remoteOpaque?: boolean;
    /** 本端 window，默认 globalThis.window（测试可注入） */
    local?: Window;
    logger?: Logger;
}
/**
 * 默认传输实现：原生 postMessage + 显式 targetOrigin + origin 白名单。
 * 设计文档首选 Penpal 封装；WTOP 自带握手/关联语义，v1.0 直接实现同一
 * Transport 接口的原生版本，Penpal/PostRobot 可按接口替换。
 */
export declare class PostMessageTransport implements Transport {
    private handlers;
    private listener;
    private disposed;
    private opts;
    constructor(opts: PostMessageTransportOptions);
    private remoteWindow;
    send(msg: WtopMessage, targetOrigin: string): void;
    onMessage(handler: (msg: WtopMessage, origin: string) => void): Unsubscribe;
    dispose(): void;
}
/** 同进程回环传输对（devtools / 单测用），语义与 postMessage 一致 */
export declare function createLoopbackPair(originA: string, originB: string): [Transport, Transport];
//# sourceMappingURL=transport.d.ts.map
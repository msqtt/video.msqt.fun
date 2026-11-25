import { collectTransferables } from './files.js';
export function isWtopEnvelope(v) {
    if (v === null || typeof v !== 'object')
        return false;
    const m = v;
    return (typeof m.wtop === 'string' &&
        typeof m.type === 'string' &&
        m.payload !== null && typeof m.payload === 'object');
}
/**
 * 默认传输实现：原生 postMessage + 显式 targetOrigin + origin 白名单。
 * 设计文档首选 Penpal 封装；WTOP 自带握手/关联语义，v1.0 直接实现同一
 * Transport 接口的原生版本，Penpal/PostRobot 可按接口替换。
 */
export class PostMessageTransport {
    constructor(opts) {
        this.handlers = new Set();
        this.listener = null;
        this.disposed = false;
        this.opts = opts;
        const local = opts.local ?? globalThis.window;
        if (!local)
            throw new Error('PostMessageTransport 需要 window 环境');
        this.listener = (e) => {
            const remote = this.remoteWindow();
            if (this.opts.remoteOpaque) {
                if (e.origin !== 'null' || !remote || e.source !== remote)
                    return;
            }
            else {
                if (!this.opts.allowedOrigins.includes(e.origin))
                    return;
                if (remote && e.source !== remote)
                    return;
            }
            if (!isWtopEnvelope(e.data))
                return;
            for (const h of this.handlers)
                h(e.data, e.origin);
        };
        local.addEventListener('message', this.listener);
    }
    remoteWindow() {
        return typeof this.opts.remote === 'function' ? this.opts.remote() : this.opts.remote;
    }
    send(msg, targetOrigin) {
        if (this.disposed)
            return;
        if (targetOrigin === '*' || !this.opts.allowedOrigins.includes(targetOrigin)) {
            this.opts.logger?.warn(`[wtop] 拒绝发送：targetOrigin 不在白名单`, targetOrigin);
            return;
        }
        const remote = this.remoteWindow();
        if (!remote)
            return;
        const transfer = collectTransferables(msg.payload);
        remote.postMessage(msg, this.opts.remoteOpaque ? '*' : targetOrigin, transfer);
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    dispose() {
        this.disposed = true;
        this.handlers.clear();
        const local = this.opts.local ?? globalThis.window;
        if (local && this.listener)
            local.removeEventListener('message', this.listener);
        this.listener = null;
    }
}
class LoopbackTransport {
    constructor(ownOrigin) {
        this.ownOrigin = ownOrigin;
        this.handlers = new Set();
        this.disposed = false;
    }
    send(msg, targetOrigin) {
        if (this.disposed || this.peer.disposed)
            return;
        if (targetOrigin === '*' || targetOrigin !== this.peer.ownOrigin)
            return;
        // 结构化克隆 + transfer，模拟真实 postMessage 语义（ArrayBuffer neutered）
        const transfer = collectTransferables(msg.payload);
        let clone;
        try {
            clone = structuredClone(msg, { transfer });
        }
        catch {
            clone = structuredClone(msg);
        }
        const origin = this.ownOrigin;
        queueMicrotask(() => {
            if (this.peer.disposed)
                return;
            for (const h of [...this.peer.handlers])
                h(clone, origin);
        });
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    dispose() {
        this.disposed = true;
        this.handlers.clear();
    }
}
/** 同进程回环传输对（devtools / 单测用），语义与 postMessage 一致 */
export function createLoopbackPair(originA, originB) {
    const a = new LoopbackTransport(originA);
    const b = new LoopbackTransport(originB);
    a.peer = b;
    b.peer = a;
    return [a, b];
}
//# sourceMappingURL=transport.js.map
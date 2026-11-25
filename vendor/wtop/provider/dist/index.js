import { PostMessageTransport, assertData, manifestHash, randomId, majorOf, } from '@wtop/core';
import { PROTOCOL_VERSION, SDK_VERSION, WtopError, } from '@wtop/types';
export { WtopError, PROTOCOL_VERSION, SDK_VERSION } from '@wtop/types';
export function createProvider(options) {
    const { manifest, hostOrigins, autoHandshake = true, handshakeTimeoutMs = 10000, validateInput = true, validateOutput = true, logger = console, } = options;
    if (!hostOrigins.length)
        throw new Error('hostOrigins 白名单不能为空');
    const transport = options.transport ?? new PostMessageTransport({
        remote: () => globalThis.window?.parent ?? null,
        allowedOrigins: hostOrigins,
        logger,
    });
    const methods = new Map();
    const calls = new Map();
    const globalVisibilityCallbacks = new Set();
    let state = 'idle';
    let sessionId = null;
    let negotiatedVersion = PROTOCOL_VERSION;
    let hostOrigin = null;
    let nonce = null;
    let handshakeTimer = null;
    let visible = false;
    let disposed = false;
    const send = (msg) => {
        if (hostOrigin)
            transport.send(msg, hostOrigin);
    };
    const sendError = (callId, err) => {
        send({
            wtop: negotiatedVersion, type: 'error', sessionId: sessionId, callId,
            payload: { code: err.code, message: err.message, details: err.details },
        });
    };
    const setState = (s) => { state = s; };
    const failHandshake = (reason) => {
        logger.warn(`[wtop/provider] 握手失败: ${reason}`);
        setState('failed');
        if (handshakeTimer) {
            clearTimeout(handshakeTimer);
            handshakeTimer = null;
        }
    };
    const terminateCall = (call, reason) => {
        if (call.terminal)
            return;
        call.terminal = true;
        const code = reason === 'human-timeout' ? 'HUMAN_TIMEOUT' : 'CANCELLED';
        const err = new WtopError(code, `调用被取消（${reason}）`);
        call.humanPending?.reject(err);
        call.humanPending = null;
        for (const cb of call.cancelCallbacks) {
            try {
                cb(reason);
            }
            catch (e) {
                logger.error('onCancel 回调异常', e);
            }
        }
        call.controller.abort();
        sendError(call.callId, err);
        calls.delete(call.callId);
    };
    const makeCtx = (call) => ({
        callId: call.callId,
        sessionId: sessionId,
        get visibility() { return visible; },
        signal: call.controller.signal,
        meta: { tool: manifest.name, method: call.method, attempt: call.attempt },
        logger,
        reportProgress(p) {
            if (call.terminal)
                return;
            send({ wtop: negotiatedVersion, type: 'progress', sessionId: sessionId, callId: call.callId, payload: p });
        },
        requestHuman(opts) {
            if (call.terminal)
                return Promise.reject(new WtopError('CANCELLED', '调用已终止'));
            send({
                wtop: negotiatedVersion, type: 'ui.requestShow', sessionId: sessionId, callId: call.callId,
                payload: { blocking: opts.blocking ?? true, reason: opts.reason },
            });
            return new Promise((resolve, reject) => {
                call.humanPending = { resolve, reject };
            });
        },
        requestShow(opts) {
            send({
                wtop: negotiatedVersion, type: 'ui.requestShow', sessionId: sessionId, callId: call.callId,
                payload: { blocking: false, reason: opts?.reason },
            });
        },
        requestHide(humanResult) {
            send({
                wtop: negotiatedVersion, type: 'ui.requestHide', sessionId: sessionId, callId: call.callId,
                payload: { humanResult },
            });
            call.humanPending?.resolve(humanResult);
            call.humanPending = null;
        },
        onCancel(cb) {
            call.cancelCallbacks.add(cb);
            return () => call.cancelCallbacks.delete(cb);
        },
        onVisibility(cb) {
            call.visibilityCallbacks.add(cb);
            return () => call.visibilityCallbacks.delete(cb);
        },
    });
    const runMethod = async (call, fn, params) => {
        const ctx = makeCtx(call);
        try {
            const output = await fn(params, ctx);
            if (call.terminal)
                return;
            if (validateOutput) {
                const def = manifest.methods.find((m) => m.name === call.method);
                assertData(def.output, output, 'INVALID_OUTPUT', `方法 ${call.method} 出参`);
            }
            call.terminal = true;
            send({ wtop: negotiatedVersion, type: 'result', sessionId: sessionId, callId: call.callId, payload: { data: output } });
            calls.delete(call.callId);
        }
        catch (e) {
            if (call.terminal)
                return;
            call.terminal = true;
            const err = e instanceof WtopError
                ? e
                : new WtopError('BUSINESS_ERROR', String(e instanceof Error ? e.message : e), e instanceof Error ? { stack: e.stack } : undefined);
            sendError(call.callId, err);
            calls.delete(call.callId);
        }
    };
    const handleMessage = (msg, origin) => {
        if (disposed)
            return;
        if (!hostOrigins.includes(origin))
            return;
        if (msg.type === 'ack') {
            if (state !== 'handshaking')
                return;
            if (msg.payload.nonce !== nonce) {
                failHandshake('nonce 不匹配');
                return;
            }
            if (msg.payload.hostOrigin !== origin) {
                failHandshake('hostOrigin 与 event.origin 不符');
                return;
            }
            sessionId = msg.payload.sessionId;
            negotiatedVersion = msg.payload.negotiatedVersion;
            hostOrigin = origin;
            if (handshakeTimer) {
                clearTimeout(handshakeTimer);
                handshakeTimer = null;
            }
            setState('ready');
            logger.debug(`[wtop/provider] 握手完成 session=${sessionId} version=${negotiatedVersion}`);
            return;
        }
        // 握手后消息：sessionId / 主版本校验（协议 §5.2.1）
        if (state !== 'ready' || !sessionId)
            return;
        if (msg.sessionId !== sessionId)
            return;
        if (majorOf(msg.wtop) !== majorOf(negotiatedVersion))
            return;
        switch (msg.type) {
            case 'invoke': {
                const callId = msg.callId;
                if (!callId || calls.has(callId))
                    return;
                const { method, params, attempt } = msg.payload;
                const fn = methods.get(method);
                const def = manifest.methods.find((m) => m.name === method);
                const call = {
                    callId, method, attempt: attempt ?? 0,
                    controller: new AbortController(), terminal: false,
                    cancelCallbacks: new Set(), visibilityCallbacks: new Set(), humanPending: null,
                };
                if (!fn || !def) {
                    sendError(callId, new WtopError('METHOD_NOT_FOUND', `未注册的方法: ${method}`));
                    return;
                }
                if (validateInput) {
                    try {
                        assertData(def.input, params, 'INVALID_INPUT', `方法 ${method} 入参`);
                    }
                    catch (e) {
                        sendError(callId, e);
                        return;
                    }
                }
                calls.set(callId, call);
                void runMethod(call, fn, params);
                return;
            }
            case 'cancel': {
                const call = msg.callId ? calls.get(msg.callId) : undefined;
                if (call)
                    terminateCall(call, msg.payload.reason);
                return;
            }
            case 'ui.visibility': {
                visible = msg.payload.visible;
                for (const cb of globalVisibilityCallbacks)
                    cb(visible);
                for (const call of calls.values())
                    for (const cb of call.visibilityCallbacks)
                        cb(visible);
                return;
            }
            case 'ping': {
                send({
                    wtop: negotiatedVersion, type: 'pong', sessionId: sessionId,
                    payload: { ts: Date.now(), echo: msg.payload.ts },
                });
                return;
            }
            default:
                return; // 未知 type 忽略（前向兼容）
        }
    };
    transport.onMessage(handleMessage);
    const provider = {
        get state() { return state; },
        get sessionId() { return sessionId; },
        registerMethod(name, fn) {
            if (!manifest.methods.some((m) => m.name === name)) {
                throw new Error(`方法 ${name} 未在 manifest 中声明`);
            }
            methods.set(name, fn);
        },
        async start() {
            if (state !== 'idle' || disposed)
                return;
            const hash = await manifestHash(manifest);
            nonce = randomId();
            setState('handshaking');
            handshakeTimer = setTimeout(() => failHandshake('握手超时（未收到 ack）'), handshakeTimeoutMs);
            const ready = {
                wtop: PROTOCOL_VERSION, type: 'ready',
                payload: { protocolVersion: PROTOCOL_VERSION, manifestHash: hash, nonce, toolName: manifest.name, sdkVersion: SDK_VERSION },
            };
            // 握手前不知道宿主具体 origin：向白名单逐一发送，只有真实 parent origin 会收到
            for (const o of hostOrigins)
                transport.send(ready, o);
        },
        completeHuman(callId, humanResult) {
            const call = calls.get(callId);
            if (!call || call.terminal)
                return;
            send({
                wtop: negotiatedVersion, type: 'ui.requestHide', sessionId: sessionId, callId,
                payload: { humanResult },
            });
            call.humanPending?.resolve(humanResult);
            call.humanPending = null;
        },
        dispose() {
            disposed = true;
            if (handshakeTimer)
                clearTimeout(handshakeTimer);
            for (const call of calls.values()) {
                call.terminal = true;
                call.controller.abort();
            }
            calls.clear();
            transport.dispose();
        },
    };
    if (autoHandshake)
        void provider.start();
    return provider;
}
//# sourceMappingURL=index.js.map
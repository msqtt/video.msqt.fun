export const PROTOCOL_VERSION = '1.0';
export const SDK_VERSION = '1.0.0';
export function defineManifest(m) {
    return {
        protocolVersion: m.protocolVersion ?? PROTOCOL_VERSION,
        name: m.name,
        ...(m.displayName !== undefined ? { displayName: m.displayName } : {}),
        version: m.version,
        ...(m.viewport !== undefined ? { viewport: m.viewport } : {}),
        methods: Object.entries(m.methods).map(([name, def]) => ({ name, ...def })),
    };
}
export const ERROR_CODES = [
    'HANDSHAKE_FAILED', 'VERSION_MISMATCH', 'METHOD_NOT_FOUND',
    'INVALID_INPUT', 'INVALID_OUTPUT', 'TIMEOUT', 'HUMAN_TIMEOUT',
    'CANCELLED', 'TOOL_CRASHED', 'BUSINESS_ERROR', 'FILE_TOO_LARGE', 'INPUT_REQUIRED',
];
export class WtopError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'WtopError';
        this.code = code;
        this.details = details;
    }
}
export const CALL_LEVEL_TYPES = [
    'invoke', 'result', 'error', 'progress', 'cancel',
    'ui.requestShow', 'ui.requestHide',
];
// ---------- 默认值常量 ----------
export const DEFAULTS = {
    handshakeTimeoutMs: 10000,
    defaultTimeoutMs: 60000,
    humanTimeoutMs: 30 * 60000,
    preserveFailedMs: 120000,
    maxConcurrent: 8,
    largeFileThresholdBytes: 50 * 1024 * 1024,
    cancelGraceMs: 5000,
    heartbeatIntervalMs: 30000,
    heartbeatMissLimit: 2,
    progressSilenceMs: 30000,
    viewport: { width: 1280, height: 800 },
};
// ---------- manifest 元 Schema（协议 §11.3，规范性） ----------
export const MANIFEST_META_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['protocolVersion', 'name', 'version', 'methods'],
    additionalProperties: false,
    properties: {
        protocolVersion: { type: 'string', pattern: '^\\d+\\.\\d+$' },
        name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' },
        displayName: { type: 'string' },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        viewport: {
            type: 'object',
            required: ['width', 'height'],
            properties: {
                width: { type: 'integer', minimum: 1 },
                height: { type: 'integer', minimum: 1 },
            },
        },
        methods: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                required: ['name', 'input', 'output'],
                additionalProperties: false,
                properties: {
                    name: { type: 'string', pattern: '^[a-zA-Z_][a-zA-Z0-9_]{0,63}$' },
                    displayName: { type: 'string' },
                    mode: { enum: ['headless', 'hybrid', 'interactive'], default: 'hybrid' },
                    timeoutMs: { type: 'integer', minimum: 1 },
                    stateless: { type: 'boolean', default: false },
                    input: { type: 'object' },
                    output: { type: 'object' },
                },
            },
        },
    },
};
//# sourceMappingURL=index.js.map
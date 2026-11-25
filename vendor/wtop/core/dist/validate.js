import Ajv2020 from 'ajv/dist/2020.js';
import { MANIFEST_META_SCHEMA, WtopError, } from '@wtop/types';
import { isFileRef } from './files.js';
function createAjv() {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    // format: "wtop-file" 接受 Blob / ArrayBuffer / FileRef 三形态（协议 §5.7.1）
    ajv.addFormat('wtop-file', {
        validate: (v) => isWtopFileValue(v),
    });
    // ajv 的 format 只作用于字符串；用自定义关键字让对象形态（Blob/FileRef）也参与校验
    ajv.addKeyword({
        keyword: 'wtopFile',
        schemaType: 'boolean',
        validate: (_schema, v) => isWtopFileValue(v),
    });
    return ajv;
}
function isWtopFileValue(v) {
    return (typeof Blob !== 'undefined' && v instanceof Blob) ||
        v instanceof ArrayBuffer ||
        ArrayBuffer.isView(v) ||
        isFileRef(v);
}
const ajv = createAjv();
const cache = new WeakMap();
/** wtop-file 字段在 schema 里声明为 type:string，但运行时是 Blob 等对象；校验前放宽这些字段的 type */
function relaxFileTypes(schema) {
    const walk = (s) => {
        if (Array.isArray(s))
            return s.map(walk);
        if (s !== null && typeof s === 'object') {
            const o = s;
            const out = {};
            for (const [k, v] of Object.entries(o))
                out[k] = walk(v);
            if (out.format === 'wtop-file') {
                delete out.type;
                out.wtopFile = true;
            }
            return out;
        }
        return s;
    };
    return walk(schema);
}
export function getValidator(schema) {
    let fn = cache.get(schema);
    if (!fn) {
        fn = ajv.compile(relaxFileTypes(schema));
        cache.set(schema, fn);
    }
    return fn;
}
export function validateData(schema, data) {
    const fn = getValidator(schema);
    const valid = fn(data);
    return {
        valid,
        errors: valid ? '' : ajv.errorsText(fn.errors, { separator: '; ' }),
    };
}
/** 校验失败抛 WtopError(code)，双端共享（Provider=INVALID_INPUT/OUTPUT，Host=INVALID_OUTPUT） */
export function assertData(schema, data, code, what) {
    const r = validateData(schema, data);
    if (!r.valid)
        throw new WtopError(code, `${what} 不符合 schema: ${r.errors}`, r.errors);
}
const metaValidator = ajv.compile(MANIFEST_META_SCHEMA);
/** manifest 元校验（协议 §11.3）+ input/output 必须是合法 JSON Schema */
export function validateManifest(manifest) {
    if (!metaValidator(manifest)) {
        throw new WtopError('INVALID_INPUT', `manifest 不符合元 Schema: ${ajv.errorsText(metaValidator.errors)}`);
    }
    const m = manifest;
    for (const method of m.methods) {
        for (const key of ['input', 'output']) {
            try {
                ajv.compile(relaxFileTypes(method[key]));
            }
            catch (e) {
                throw new WtopError('INVALID_INPUT', `方法 ${method.name} 的 ${key} 不是合法 JSON Schema: ${String(e)}`);
            }
        }
    }
}
//# sourceMappingURL=validate.js.map
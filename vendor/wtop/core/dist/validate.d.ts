import { type ValidateFunction } from 'ajv/dist/2020.js';
import { type JSONSchema, type Manifest } from '@wtop/types';
export declare function getValidator(schema: JSONSchema): ValidateFunction;
export interface ValidationResult {
    valid: boolean;
    errors: string;
}
export declare function validateData(schema: JSONSchema, data: unknown): ValidationResult;
/** 校验失败抛 WtopError(code)，双端共享（Provider=INVALID_INPUT/OUTPUT，Host=INVALID_OUTPUT） */
export declare function assertData(schema: JSONSchema, data: unknown, code: 'INVALID_INPUT' | 'INVALID_OUTPUT', what: string): void;
/** manifest 元校验（协议 §11.3）+ input/output 必须是合法 JSON Schema */
export declare function validateManifest(manifest: unknown): asserts manifest is Manifest;
//# sourceMappingURL=validate.d.ts.map
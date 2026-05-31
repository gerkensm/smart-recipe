import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import type { TSchema } from "typebox";

interface AjvValidator {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

interface AjvInstance {
  compile(schema: unknown): AjvValidator;
}

const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => AjvInstance;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new WeakMap<object, AjvValidator>();

export interface ApiResponseValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateApiResponse(schema: TSchema, value: unknown): ApiResponseValidationResult {
  const validate = validatorFor(schema);
  const ok = validate(value);
  return {
    ok,
    errors: ok
      ? []
      : (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
  };
}

export function assertApiResponse<T>(schema: TSchema, value: unknown): T {
  const result = validateApiResponse(schema, value);
  if (!result.ok) {
    throw new TypeError(result.errors.join("\n"));
  }
  return value as T;
}

function validatorFor(schema: TSchema): AjvValidator {
  const cached = validators.get(schema);
  if (cached) return cached;
  const compiled = ajv.compile(schema);
  validators.set(schema, compiled);
  return compiled;
}

import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import betterAjvErrors from "better-ajv-errors";
import { RecipeInputSchema, SmartRecipePayloadSchema, type RecipeInput } from "./schema.js";
import type { SmartRecipePayload } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  formattedErrors?: string;
}

interface AjvValidator {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

interface AjvInstance {
  compile(schema: unknown): AjvValidator;
}

function makeAjv(): AjvInstance {
  const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => AjvInstance;
  return new Ajv2020({ allErrors: true, strict: false });
}

const ajv = makeAjv();
const recipeInputValidator = ajv.compile(RecipeInputSchema);
const smartRecipePayloadValidator = ajv.compile(SmartRecipePayloadSchema);

export function formatAjvValidationErrors(schema: unknown, data: unknown, errors: ErrorObject[] | null | undefined): ValidationResult {
  const ajvErrors = errors ?? [];
  if (ajvErrors.length === 0) return { ok: false, errors: [] };

  const conciseErrors = ajvErrors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
  let formattedErrors: string | undefined;
  try {
    const formatted = betterAjvErrors(schema, data, ajvErrors, { format: "cli", indent: 2 });
    formattedErrors = formatted.trim() || undefined;
  } catch {
    formattedErrors = undefined;
  }
  return { ok: false, errors: conciseErrors, formattedErrors };
}

/**
 * Validates model-generated recipe input against the model-optimized RecipeInputSchema.
 *
 * This is the first validation boundary in the pipeline. It runs immediately after the LLM
 * produces a structured output, checking that the model's JSON conforms to the simplified,
 * model-friendly schema (RecipeInputSchema) before it is transformed into an API payload.
 *
 * Errors from this function are fed back to the LLM in auto-correction loops, so they
 * are intentionally concise and use JSON Pointer paths (e.g. "/servingSize/steps/0/mode/speed
 * must be <= 3") that are easy for the model to interpret and correct.
 */
export function validateRecipeInput(input: unknown): ValidationResult {
  const ok = recipeInputValidator(input);
  return ok ? { ok, errors: [] } : formatAjvValidationErrors(RecipeInputSchema, input, recipeInputValidator.errors);
}

export function assertRecipeInput(input: unknown): asserts input is RecipeInput {
  const result = validateRecipeInput(input);
  if (!result.ok) {
    throw new TypeError(`Recipe input failed schema validation:\n${result.formattedErrors ?? result.errors.join("\n")}`);
  }
}

/**
 * Validates the fully-assembled API payload against the API-optimized SmartRecipePayloadSchema.
 *
 * This is the second validation boundary, running after createSmartRecipePayload() has
 * transformed and structured the recipe input into the exact JSON required by the Monsieur
 * Cuisine Smart API. It verifies device-specific constraints such as the fixed deviceTypeIds
 * tuple ([13]), the exact serving size tuple structure, stringified ingredient amounts,
 * null sentinel fields, and raw hardware mode shapes.
 *
 * Errors here indicate bugs in the payload builder (payload.ts) or mode converter (modes.ts),
 * not in the model output, and are therefore thrown as TypeErrors rather than returned for
 * LLM correction.
 */
export function assertSmartRecipePayload(payload: SmartRecipePayload): SmartRecipePayload {
  const ok = smartRecipePayloadValidator(payload);
  if (!ok) {
    const result = formatAjvValidationErrors(SmartRecipePayloadSchema, payload, smartRecipePayloadValidator.errors);
    throw new TypeError(`Recipe payload failed schema validation:\n${result.formattedErrors ?? result.errors.join("\n")}`);
  }
  return payload;
}

import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { RecipeInputSchema, type RecipeInput } from "./schema.js";
import {
  MONSIEUR_CUISINE_SMART_DEVICE_TYPE_ID,
  SMART_FERMENTATION_TEMPERATURE_STEPS,
  SMART_HEATING_TEMPERATURE_STEPS,
  SMART_LOW_TEMPERATURE_STEPS,
  SMART_MODE_TYPES
} from "./constants.js";
import { assertIntegerRange, assertOneOf } from "./modes.js";
import type { SmartRecipePayload } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateRecipeInput(input: unknown): ValidationResult {
  const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;
  const addFormats = addFormatsModule as unknown as (ajv: any) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(RecipeInputSchema);
  let ok = validate(input);
  const errors = ok
    ? []
    : (validate.errors ?? []).map((error: any) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);

  return {
    ok,
    errors
  };
}

export function assertRecipeInput(input: unknown): asserts input is RecipeInput {
  const result = validateRecipeInput(input);
  if (!result.ok) {
    throw new TypeError(`Recipe input failed schema validation:\n${result.errors.join("\n")}`);
  }
}

export function assertSmartRecipePayload(payload: SmartRecipePayload): SmartRecipePayload {
  if (!payload || typeof payload !== "object") throw new TypeError("Recipe payload must be an object.");
  if (payload.deviceTypeIds.length !== 1 || payload.deviceTypeIds[0] !== MONSIEUR_CUISINE_SMART_DEVICE_TYPE_ID) {
    throw new TypeError("SmartRecipe only supports Monsieur Cuisine Smart deviceTypeIds [13].");
  }
  if (!payload.title) throw new TypeError("Recipe payload title is required.");
  if (!Array.isArray(payload.servingSizes) || payload.servingSizes.length !== 1) {
    throw new TypeError("Recipe payload must include exactly one serving size.");
  }

  const servingSize = payload.servingSizes[0] as {
    ingredientGroups?: unknown[];
    steps?: Array<{ description?: string; mode?: unknown }>;
  };
  if (!Array.isArray(servingSize.ingredientGroups) || servingSize.ingredientGroups.length < 1) {
    throw new TypeError("servingSizes[0].ingredientGroups must contain at least one group.");
  }
  if (!Array.isArray(servingSize.steps) || servingSize.steps.length < 1) {
    throw new TypeError("servingSizes[0].steps must contain at least one step.");
  }
  servingSize.steps.forEach((step, index) => {
    if ((step.description ?? "").length > 240) {
      throw new TypeError(`servingSizes[0].steps[${index}].description must be 240 characters or fewer.`);
    }
    if (step.mode !== null && step.mode !== undefined) validateRawMode(step.mode, `servingSizes[0].steps[${index}].mode`);
  });
  return payload;
}

function validateRawMode(mode: unknown, path: string): void {
  if (!mode || typeof mode !== "object") throw new TypeError(`${path} must be an object.`);
  const raw = mode as { type?: string; modeSetting?: unknown; deviceSettings?: Array<Record<string, unknown>> };

  if (raw.type === SMART_MODE_TYPES.cookingEggs) {
    const setting = raw.modeSetting as { size?: string; texture?: string };
    assertOneOf(setting?.size, ["small", "medium", "large"], `${path}.modeSetting.size`);
    assertOneOf(setting?.texture, ["soft", "waxy_soft", "hard"], `${path}.modeSetting.texture`);
    return;
  }
  if (raw.type === SMART_MODE_TYPES.precleaning) {
    const setting = raw.modeSetting as { duration?: string };
    assertOneOf(setting?.duration, ["short", "long"], `${path}.modeSetting.duration`);
    return;
  }
  if (raw.modeSetting !== null) throw new TypeError(`${path}.modeSetting must be null.`);
  if (!Array.isArray(raw.deviceSettings) || raw.deviceSettings.length !== 1) {
    throw new TypeError(`${path}.deviceSettings must contain exactly one setting.`);
  }
  const setting = raw.deviceSettings[0];
  const time = Number(setting.time ?? 0);
  switch (raw.type) {
    case SMART_MODE_TYPES.manualCooking:
      assertOneOf(setting.temperature, SMART_HEATING_TEMPERATURE_STEPS, `${path}.temperature`);
      assertIntegerRange(time, 1, 5940, `${path}.time`);
      assertIntegerRange(Number(setting.speed), 0, 10, `${path}.speed`);
      if (Number(setting.temperature) > 0 && Number(setting.speed) > 3) throw new TypeError(`${path}.speed must be 3 or lower when heating.`);
      if (setting.clockwise === false && Number(setting.speed) > 3) throw new TypeError(`${path}.speed must be 3 or lower when using reverse rotation.`);
      break;
    case SMART_MODE_TYPES.turbo:
      assertIntegerRange(time, 1, 20, `${path}.time`);
      break;
    case SMART_MODE_TYPES.scale:
      assertIntegerRange(Number(setting.weight), 5, 5000, `${path}.weight`);
      break;
    case SMART_MODE_TYPES.roast:
      assertOneOf(setting.temperature, SMART_HEATING_TEMPERATURE_STEPS, `${path}.temperature`);
      assertIntegerRange(time, 0, 840, `${path}.time`);
      break;
    case SMART_MODE_TYPES.solidDoughKnead:
    case SMART_MODE_TYPES.softDoughKnead:
      assertIntegerRange(time, 45, 240, `${path}.time`);
      break;
    case SMART_MODE_TYPES.liquidDoughKnead:
      assertIntegerRange(time, 45, 360, `${path}.time`);
      break;
    case SMART_MODE_TYPES.steam:
      assertIntegerRange(time, 0, 3600, `${path}.time`);
      break;
    case SMART_MODE_TYPES.sousVide:
      assertIntegerRange(Number(setting.temperature), 40, 85, `${path}.temperature`);
      assertIntegerRange(time, 900, 43200, `${path}.time`);
      break;
    case SMART_MODE_TYPES.slowCooking:
      assertOneOf(setting.temperature, SMART_LOW_TEMPERATURE_STEPS, `${path}.temperature`);
      assertIntegerRange(time, 900, 28800, `${path}.time`);
      break;
    case SMART_MODE_TYPES.fermentation:
      assertOneOf(setting.temperature, SMART_FERMENTATION_TEMPERATURE_STEPS, `${path}.temperature`);
      assertIntegerRange(time, 1800, 43200, `${path}.time`);
      break;
    case SMART_MODE_TYPES.riceCooking:
      assertIntegerRange(time, 1200, 2400, `${path}.time`);
      break;
    case SMART_MODE_TYPES.foodProcessor:
      assertIntegerRange(time, 1, 300, `${path}.time`);
      break;
    case SMART_MODE_TYPES.puree:
    case SMART_MODE_TYPES.smoothie:
      assertIntegerRange(time, 30, 120, `${path}.time`);
      break;
    default:
      throw new TypeError(`${path}.type is not supported for Monsieur Cuisine Smart: ${String(raw.type)}`);
  }
}

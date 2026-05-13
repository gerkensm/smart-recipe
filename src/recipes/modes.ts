import {
  SMART_FERMENTATION_TEMPERATURE_STEPS,
  SMART_HEATING_TEMPERATURE_STEPS,
  SMART_LOW_TEMPERATURE_STEPS,
  SMART_MODE_GUIDE,
  SMART_MODE_TYPES
} from "./constants.js";
import type { PromptModeInput } from "./types.js";

type TimeModeInput = Extract<PromptModeInput, { seconds: number }>;
type TemperatureTimeModeInput = Extract<PromptModeInput, { temperature: number; minutes: number; seconds: number }>;

export type RawSmartMode =
  | null
  | { type: string; modeSetting: null; deviceSettings: Array<Record<string, unknown>> }
  | { type: "cooking_eggs"; modeSetting: { size: string; texture: string } }
  | { type: "precleaning"; modeSetting: { duration: string } };

export function secondsFromParts(minutes = 0, seconds = 0): number {
  assertIntegerRange(minutes, 0, 10000, "minutes");
  assertIntegerRange(seconds, 0, 59, "seconds");
  return minutes * 60 + seconds;
}

export function promptModeToRawMode(input?: PromptModeInput | null): RawSmartMode {
  if (!input || input.type === "none") return null;

  switch (input.type) {
    case "manualCooking": {
      const temperature = input.temperature ?? 0;
      const speed = input.speed ?? 0;
      assertOneOf(temperature, SMART_HEATING_TEMPERATURE_STEPS, "manualCooking.temperature");
      assertIntegerRange(secondsFromParts(input.minutes ?? 0, input.seconds ?? 0), 1, 5940, "manualCooking.time");
      assertIntegerRange(speed, 0, 10, "manualCooking.speed");
      if (temperature > 0 && speed > 3) {
        throw new TypeError("manualCooking.speed must be 3 or lower when heating is enabled.");
      }
      if ((input.rotationDirection ?? "right") === "left" && speed > 3) {
        throw new TypeError("manualCooking.speed must be 3 or lower when rotationDirection is left.");
      }
      return {
        type: SMART_MODE_TYPES.manualCooking,
        modeSetting: null,
        deviceSettings: [
          {
            order: 0,
            temperature,
            time: secondsFromParts(input.minutes ?? 0, input.seconds ?? 0),
            speed,
            clockwise: (input.rotationDirection ?? "right") === "right"
          }
        ]
      };
    }
    case "turbo":
      return timeMode(SMART_MODE_TYPES.turbo, input, SMART_MODE_GUIDE.turbo.time.min, SMART_MODE_GUIDE.turbo.time.max);
    case "scale": {
      const weight = input.grams ?? SMART_MODE_GUIDE.scale.weight.min;
      assertIntegerRange(weight, SMART_MODE_GUIDE.scale.weight.min, SMART_MODE_GUIDE.scale.weight.max, "scale.grams");
      return {
        type: SMART_MODE_TYPES.scale,
        modeSetting: null,
        deviceSettings: [{ order: 0, weight }]
      };
    }
    case "roast": {
      const temperature = input.temperature ?? 0;
      assertOneOf(temperature, SMART_HEATING_TEMPERATURE_STEPS, "roast.temperature");
      return temperatureTimeMode(SMART_MODE_TYPES.roast, input, 0, 840, () => temperature);
    }
    case "solidDoughKnead":
      return timeMode(SMART_MODE_TYPES.solidDoughKnead, input, 45, 240);
    case "softDoughKnead":
      return timeMode(SMART_MODE_TYPES.softDoughKnead, input, 45, 240);
    case "liquidDoughKnead":
      return timeMode(SMART_MODE_TYPES.liquidDoughKnead, input, 45, 360);
    case "steam":
      return timeMode(SMART_MODE_TYPES.steam, input, 0, 3600);
    case "sousVide":
      return temperatureTimeMode(SMART_MODE_TYPES.sousVide, input, 15 * 60, 720 * 60, () => {
        const temperature = input.temperature ?? 55;
        assertIntegerRange(temperature, 40, 85, "sousVide.temperature");
        return temperature;
      });
    case "slowCooking":
      return temperatureTimeMode(SMART_MODE_TYPES.slowCooking, input, 15 * 60, 480 * 60, () => {
        const temperature = input.temperature ?? 85;
        assertOneOf(temperature, SMART_LOW_TEMPERATURE_STEPS, "slowCooking.temperature");
        return temperature;
      });
    case "cookingEggs":
      assertOneOf(input.size ?? "medium", SMART_MODE_GUIDE.cookingEggs.sizeOptions, "cookingEggs.size");
      assertOneOf(input.texture ?? "waxy_soft", SMART_MODE_GUIDE.cookingEggs.textureOptions, "cookingEggs.texture");
      return {
        type: SMART_MODE_TYPES.cookingEggs,
        modeSetting: {
          size: input.size ?? "medium",
          texture: input.texture ?? "waxy_soft"
        }
      };
    case "precleaning":
      assertOneOf(input.duration ?? "short", SMART_MODE_GUIDE.precleaning.cleaningOptions, "precleaning.duration");
      return {
        type: SMART_MODE_TYPES.precleaning,
        modeSetting: { duration: input.duration ?? "short" }
      };
    case "fermentation":
      return temperatureTimeMode(SMART_MODE_TYPES.fermentation, input, 30 * 60, 720 * 60, () => {
        const temperature = input.temperature ?? 37;
        assertOneOf(temperature, SMART_FERMENTATION_TEMPERATURE_STEPS, "fermentation.temperature");
        return temperature;
      });
    case "riceCooking":
      return timeMode(SMART_MODE_TYPES.riceCooking, input, 1200, 2400);
    case "foodProcessor":
      return timeMode(SMART_MODE_TYPES.foodProcessor, input, 1, 300);
    case "puree":
      return timeMode(SMART_MODE_TYPES.puree, input, 30, 120);
    case "smoothie":
      return timeMode(SMART_MODE_TYPES.smoothie, input, 30, 120);
    default:
      assertNever(input);
  }
}

function timeMode(type: string, input: TimeModeInput, min: number, max: number) {
  const minutes = "minutes" in input ? input.minutes : 0;
  const time = secondsFromParts(minutes, input.seconds);
  assertIntegerRange(time, min, max, `${input.type}.time`);
  return { type, modeSetting: null, deviceSettings: [{ order: 0, time }] };
}

function temperatureTimeMode(
  type: string,
  input: TemperatureTimeModeInput,
  min: number,
  max: number,
  temperatureResolver: () => number
) {
  const time = secondsFromParts(input.minutes, input.seconds);
  assertIntegerRange(time, min, max, `${input.type}.time`);
  return {
    type,
    modeSetting: null,
    deviceSettings: [{ order: 0, temperature: temperatureResolver(), time }]
  };
}

export function assertIntegerRange(value: unknown, min: number, max: number, path: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new TypeError(`${path} must be an integer from ${min} to ${max}.`);
  }
}

export function assertOneOf<T>(value: unknown, allowed: readonly T[], path: string): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new TypeError(`${path} must be one of ${allowed.join(", ")}.`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Smart mode type: ${value}`);
}

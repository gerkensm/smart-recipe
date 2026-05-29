import { Buffer } from "node:buffer";
import type { CookidooRecipeInput } from "./schema.js";

export interface Position {
  offset: number;
  length: number;
}

export type ModeName =
  | "manual"
  | "dough"
  | "blend"
  | "turbo"
  | "warm_up"
  | "cook"
  | "rice_cooker"
  | "steaming"
  | "browning";

export type Direction = "CW" | "CCW";

export interface Temperature {
  value: string;
  unit: "C" | "F";
}

export interface ModeData {
  time?: number;
  speed?: string;
  direction?: Direction;
  temperature?: Temperature;
  power?: "Gentle" | "Intensive";
  pulseCount?: number;
  pulseCountMax?: number;
  accessory?: "Varoma" | "SimmeringBasket" | "VaromaAndSimmeringBasket";
}

export interface ModeAnnotation {
  type: "MODE";
  name: ModeName;
  data: ModeData;
  position: Position;
}

export type Annotation = ModeAnnotation; // We focus on mode annotations

export interface Step {
  type: "STEP";
  text: string;
  annotations?: Annotation[];
}

export interface Ingredient {
  type: "INGREDIENT";
  text: string;
}

export interface RecipeYield {
  value: number;
  unitText: string;
}

export interface MetaPatch {
  name?: string;
  ingredients?: Ingredient[];
  yield?: RecipeYield;
  prepTime?: number;
  totalTime?: number;
  image?: string;
  isImageOwnedByUser?: boolean;
  hints?: string;
}

export interface CookidooPayload {
  meta: MetaPatch;
  instructions: Step[];
}

function parsePngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function parseJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      return null;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    const length = (buffer[offset + 2] << 8) | buffer[offset + 3];

    const isSOF =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSOF) {
      if (offset + 8 >= buffer.length) return null;
      const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
      const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
      return { width, height };
    }

    offset += length + 2;
  }
  return null;
}

export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  const png = parsePngDimensions(buffer);
  if (png) return png;
  const jpeg = parseJpegDimensions(buffer);
  if (jpeg) return jpeg;
  return null;
}


function clampBrowningTemp(temp: number): 140 | 145 | 150 | 155 | 160 {
  const allowed = [140, 145, 150, 155, 160];
  let closest = allowed[0];
  let minDiff = Math.abs(temp - closest);
  for (const val of allowed) {
    const diff = Math.abs(temp - val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = val;
    }
  }
  return closest as 140 | 145 | 150 | 155 | 160;
}

export function createCookidooMetaPatch(input: CookidooRecipeInput): MetaPatch {
  return {
    name: input.title,
    ingredients: input.ingredients.map((ing) => ({
      type: "INGREDIENT",
      text: ing.text,
    })),
    yield: {
      value: input.servingSize,
      // The Cookidoo API enforces an enum for unitText. "portion" is the only
      // confirmed valid value (observed from live API responses).
      unitText: "portion",
    },
    prepTime: input.prepTime * 60,   // convert minutes to seconds
    totalTime: input.totalTime * 60, // convert minutes to seconds
    hints: input.hints ?? "",             // tips/notes from the source; empty string clears dummy template tips
  };
}

export function createCookidooPayload(input: CookidooRecipeInput): CookidooPayload {
  return {
    meta: createCookidooMetaPatch(input),
    instructions: createCookidooInstructions(input),
  };
}

export function createCookidooInstructions(input: CookidooRecipeInput): Step[] {
  return input.steps.map((stepInput) => {
    const step: Step = {
      type: "STEP",
      text: stepInput.text,
    };

    const annotations: Annotation[] = [];
    const searchOffsets: Record<string, number> = {};

    // 1. Process ingredient annotations
    if (stepInput.ingredientAnnotations) {
      for (const ann of stepInput.ingredientAnnotations) {
        const term = ann.matchedSubstring;
        const startFrom = searchOffsets[term] ?? 0;
        const offset = stepInput.text.indexOf(term, startFrom);
        if (offset !== -1) {
          const ingObj = input.ingredients.find(i => i.id === ann.ingredientId);
          const ingredientText = ingObj ? ingObj.text : undefined;
          if (ingredientText) {
            annotations.push({
              type: "INGREDIENT",
              position: { offset, length: term.length },
              data: {
                description: {
                  text: ingredientText,
                  annotations: [],
                },
              },
            } as any);
          }
          searchOffsets[term] = offset + term.length;
        }
      }
    }

    // 2. Process mode annotations
    if (stepInput.modeAnnotations) {
      for (const ann of stepInput.modeAnnotations) {
        const term = ann.matchedSubstring;
        const startFrom = searchOffsets[term] ?? 0;
        const offset = stepInput.text.indexOf(term, startFrom);
        if (offset !== -1) {
          const m = ann.mode;
          let modeAnn: ModeAnnotation | null = null;

          if (m.type === "dough") {
            modeAnn = {
              type: "MODE",
              name: "dough",
              data: { time: m.time },
              position: { offset, length: term.length },
            };
          } else if (m.type === "blend") {
            modeAnn = {
              type: "MODE",
              name: "blend",
              data: {
                time: m.time,
                speed: m.speed,
                direction: "CW",
              },
              position: { offset, length: term.length },
            };
          } else if (m.type === "turbo") {
            const data: ModeData = { time: m.pulseDuration };
            if (m.pulseCount !== undefined) {
              data.pulseCount = m.pulseCount;
            }
            modeAnn = {
              type: "MODE",
              name: "turbo",
              data,
              position: { offset, length: term.length },
            };
          } else if (m.type === "warmUp") {
            modeAnn = {
              type: "MODE",
              name: "warm_up",
              data: {
                temperature: { value: String(m.temperature), unit: "C" },
                speed: m.speed,
              },
              position: { offset, length: term.length },
            };
          } else if (m.type === "cook") {
            modeAnn = {
              type: "MODE",
              name: "cook",
              data: {
                time: m.time,
                temperature: { value: String(m.temperature), unit: "C" },
                speed: m.speed,
                ...(m.direction ? { direction: m.direction } : {}),
              },
              position: { offset, length: term.length },
            };
          } else if (m.type === "riceCooker") {
            modeAnn = {
              type: "MODE",
              name: "rice_cooker",
              data: {},
              position: { offset, length: term.length },
            };
          } else if (m.type === "steaming") {
            let mappedAccessory: "Varoma" | "SimmeringBasket" | "VaromaAndSimmeringBasket" = "Varoma";
            const acc = m.accessory as string | undefined;
            if (acc === "Gareinsatz" || acc === "SimmeringBasket") {
              mappedAccessory = "SimmeringBasket";
            } else if (acc === "both" || acc === "VaromaAndSimmeringBasket") {
              mappedAccessory = "VaromaAndSimmeringBasket";
            }
            modeAnn = {
              type: "MODE",
              name: "steaming",
              data: {
                time: m.time,
                speed: m.speed,
                direction: m.direction ?? "CW",
                accessory: mappedAccessory,
              },
              position: { offset, length: term.length },
            };
          } else if (m.type === "browning") {
            const clampedTemp = clampBrowningTemp(m.temperature);
            modeAnn = {
              type: "MODE",
              name: "browning",
              data: {
                time: m.time,
                temperature: { value: String(clampedTemp), unit: "C" },
                power: m.power ?? "Gentle",
              },
              position: { offset, length: term.length },
            };
          }

          if (modeAnn) {
            annotations.push(modeAnn);
          }
          searchOffsets[term] = offset + term.length;
        }
      }
    }

    if (annotations.length > 0) {
      step.annotations = annotations.sort((a, b) => a.position.offset - b.position.offset);
    }

    return step;
  });
}

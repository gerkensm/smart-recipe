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
  power?: "Gentle";
  pulseCount?: number;
  pulseCountMax?: number;
  accessory?: "Varoma";
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
    ingredients: input.ingredients.map((text) => ({
      type: "INGREDIENT",
      text,
    })),
    yield: {
      value: input.servingSize,
      unitText: input.servingUnitText,
    },
    prepTime: input.prepTime * 60,   // convert minutes to seconds
    totalTime: input.totalTime * 60, // convert minutes to seconds
  };
}

export function createCookidooInstructions(input: CookidooRecipeInput): Step[] {
  return input.steps.map((stepInput) => {
    const step: Step = {
      type: "STEP",
      text: stepInput.text,
    };

    if (stepInput.modeAnnotations && stepInput.modeAnnotations.length > 0) {
      const annotations: Annotation[] = [];

      for (const ann of stepInput.modeAnnotations) {
        if (!ann.matchedSubstring) continue;

        const offset = stepInput.text.indexOf(ann.matchedSubstring);
        if (offset === -1) {
          // Fallback: drop hallucinated substring
          continue;
        }

        const position: Position = {
          offset,
          length: ann.matchedSubstring.length,
        };

        const m = ann.mode;
        let modeAnn: ModeAnnotation | null = null;

        if (m.type === "dough") {
          modeAnn = {
            type: "MODE",
            name: "dough",
            data: { time: m.time },
            position,
          };
        } else if (m.type === "blend") {
          modeAnn = {
            type: "MODE",
            name: "blend",
            data: {
              time: m.time ?? 30,
              speed: m.speed,
              direction: "CW",
            },
            position,
          };
        } else if (m.type === "turbo") {
          const data: ModeData = { time: m.time };
          if (m.pulseCount !== undefined) {
            data.pulseCount = m.pulseCount;
          }
          modeAnn = {
            type: "MODE",
            name: "turbo",
            data,
            position,
          };
        } else if (m.type === "warmUp") {
          modeAnn = {
            type: "MODE",
            name: "warm_up",
            data: {
              temperature: { value: String(m.temperature), unit: "C" },
              speed: m.speed,
            },
            position,
          };
        } else if (m.type === "riceCooker") {
          modeAnn = {
            type: "MODE",
            name: "rice_cooker",
            data: {},
            position,
          };
        } else if (m.type === "steaming") {
          modeAnn = {
            type: "MODE",
            name: "steaming",
            data: {
              time: m.time,
              speed: m.speed,
              direction: m.direction ?? "CW",
              accessory: m.accessory ?? "Varoma",
            },
            position,
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
            position,
          };
        }

        if (modeAnn) {
          annotations.push(modeAnn);
        }
      }

      if (annotations.length > 0) {
        // Sort by offset ascending to match native API expectations
        step.annotations = annotations.sort((a, b) => a.position.offset - b.position.offset);
      }
    }

    return step;
  });
}

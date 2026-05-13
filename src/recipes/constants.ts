export const MONSIEUR_CUISINE_SMART_DEVICE_TYPE_ID = 13;
export const MONSIEUR_CUISINE_SMART_DEVICE_CODE = "MC3.0";

export const SMART_MODE_TYPES = {
  manualCooking: "customized",
  turbo: "turbo",
  scale: "scale",
  roast: "roasting",
  solidDoughKnead: "kneading_solid_dough",
  softDoughKnead: "kneading_soft_dough",
  liquidDoughKnead: "kneading_liquid_dough",
  steam: "steaming",
  sousVide: "sous_vide",
  slowCooking: "slow_cooking",
  cookingEggs: "cooking_eggs",
  precleaning: "precleaning",
  fermentation: "fermentation",
  riceCooking: "rice_cooking",
  foodProcessor: "food_processor",
  puree: "puree",
  smoothie: "smoothie"
} as const;

export const SMART_HEATING_TEMPERATURE_STEPS = [
  0, 37, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130
] as const;

export const SMART_LOW_TEMPERATURE_STEPS = [37, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const;
export const SMART_FERMENTATION_TEMPERATURE_STEPS = [37, 40, 45, 50, 55, 60, 65] as const;

export const SMART_MODE_GUIDE = {
  manualCooking: {
    description: "General manual cooking with temperature, time, speed and blade direction.",
    temperature: { unit: "C", steps: SMART_HEATING_TEMPERATURE_STEPS },
    time: { unit: "seconds", min: 1, max: 5940 },
    speed: { min: 0, max: 10, heatedMax: 3 },
    rotationDirection: ["left", "right"]
  },
  turbo: { description: "Short high-power chopping bursts.", time: { unit: "seconds", min: 1, max: 20 } },
  scale: { description: "Use the integrated scale.", weight: { unit: "g", min: 5, max: 5000 } },
  roast: {
    description: "Roasting/frying mode.",
    temperature: { unit: "C", steps: SMART_HEATING_TEMPERATURE_STEPS },
    time: { unit: "seconds", min: 0, max: 840 }
  },
  solidDoughKnead: { description: "Knead firm dough such as bread or pizza dough.", time: { unit: "seconds", min: 45, max: 240 } },
  softDoughKnead: { description: "Knead soft doughs and batters.", time: { unit: "seconds", min: 45, max: 240 } },
  liquidDoughKnead: { description: "Mix liquid doughs and loose batters.", time: { unit: "seconds", min: 45, max: 360 } },
  steam: { description: "Steam cooking.", time: { unit: "seconds", min: 0, max: 3600 } },
  sousVide: { description: "Sous-vide cooking.", temperature: { unit: "C", min: 40, max: 85 }, time: { unit: "minutes", min: 15, max: 720 } },
  slowCooking: {
    description: "Slow cooking at low temperatures.",
    temperature: { unit: "C", steps: SMART_LOW_TEMPERATURE_STEPS },
    time: { unit: "minutes", min: 15, max: 480 }
  },
  cookingEggs: {
    description: "Automatic egg cooking.",
    sizeOptions: ["small", "medium", "large"],
    textureOptions: ["soft", "waxy_soft", "hard"],
    durationMinutes: {
      small: { soft: 8, waxy_soft: 9, hard: 15 },
      medium: { soft: 10, waxy_soft: 12, hard: 18 },
      large: { soft: 11, waxy_soft: 13, hard: 18 }
    }
  },
  precleaning: { description: "Automatic pre-cleaning.", cleaningOptions: ["short", "long"], durationMinutes: { short: 1.5, long: 5 } },
  fermentation: {
    description: "Fermentation/proofing mode.",
    temperature: { unit: "C", steps: SMART_FERMENTATION_TEMPERATURE_STEPS },
    time: { unit: "minutes", min: 30, max: 720 }
  },
  riceCooking: { description: "Automatic rice cooking.", time: { unit: "seconds", min: 1200, max: 2400 } },
  foodProcessor: { description: "Food processor/cutter program.", time: { unit: "seconds", min: 1, max: 300 } },
  puree: { description: "Puree program.", time: { unit: "seconds", min: 30, max: 120 } },
  smoothie: { description: "Smoothie program.", time: { unit: "seconds", min: 30, max: 120 } }
} as const;

export const SMART_PROMPT_MODE_NAMES = [
  "none",
  "manualCooking",
  "turbo",
  "scale",
  "roast",
  "solidDoughKnead",
  "softDoughKnead",
  "liquidDoughKnead",
  "steam",
  "sousVide",
  "slowCooking",
  "cookingEggs",
  "precleaning",
  "fermentation",
  "riceCooking",
  "foodProcessor",
  "puree",
  "smoothie"
] as const;

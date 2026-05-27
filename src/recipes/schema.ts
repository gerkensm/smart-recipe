import Type, { type Static } from "typebox";
import { categoryMeta, localeComplexityIds } from "../catalogs/catalogs.js";
import {
  SMART_FERMENTATION_TEMPERATURE_STEPS,
  SMART_HEATING_TEMPERATURE_STEPS,
  SMART_LOW_TEMPERATURE_STEPS
} from "./constants.js";

const ModeObjectOptions = {
  additionalProperties: false,
  description: "Mode settings in a model-friendly shape. The library converts this into the raw Monsieur Cuisine mode payload."
} as const;

const SMART_NON_ZERO_HEATING_TEMPERATURE_STEPS = SMART_HEATING_TEMPERATURE_STEPS.filter(
  (temperature) => temperature !== 0
) as Exclude<(typeof SMART_HEATING_TEMPERATURE_STEPS)[number], 0>[];

function integerEnumSchema<const T extends readonly number[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({
    type: "integer",
    enum: [...values],
    description
  });
}

const HeatingTemperatureSchema = integerEnumSchema(
  SMART_HEATING_TEMPERATURE_STEPS,
  `Temperature in C. Use one of: ${SMART_HEATING_TEMPERATURE_STEPS.join(", ")}.`
);

const NonZeroHeatingTemperatureSchema = integerEnumSchema(
  SMART_NON_ZERO_HEATING_TEMPERATURE_STEPS,
  `Temperature in C. Use one of: ${SMART_NON_ZERO_HEATING_TEMPERATURE_STEPS.join(", ")}.`
);

const LowTemperatureSchema = integerEnumSchema(
  SMART_LOW_TEMPERATURE_STEPS,
  `Temperature in C. Use one of: ${SMART_LOW_TEMPERATURE_STEPS.join(", ")}.`
);

const FermentationTemperatureSchema = integerEnumSchema(
  SMART_FERMENTATION_TEMPERATURE_STEPS,
  `Temperature in C. Use one of: ${SMART_FERMENTATION_TEMPERATURE_STEPS.join(", ")}.`
);

const SecondsRemainderSchema = Type.Integer({
  minimum: 0,
  maximum: 59,
  description: "Remaining seconds after whole minutes."
});

function minutesSchema(maximum: number, description: string) {
  return Type.Integer({ minimum: 0, maximum, description });
}

function timeFields(maximumMinutes: number, description: string) {
  return {
    minutes: minutesSchema(maximumMinutes, description),
    seconds: SecondsRemainderSchema
  };
}

const RecipeStepModeSchemaNone = Type.Object(
  {
    type: Type.Literal("none", { description: "Human-only instruction without an automatic Smart mode." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaManualCookingRight = Type.Object(
  {
    type: Type.Literal("manualCooking"),
    temperature: Type.Literal(0),
    ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
    speed: Type.Integer({ minimum: 0, maximum: 10, description: "Manual cooking speed without heating and with right rotation." }),
    rotationDirection: Type.Literal("right", { description: "Blade direction for manual cooking." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaManualCookingLeft = Type.Object(
  {
    type: Type.Literal("manualCooking"),
    temperature: Type.Literal(0),
    ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
    speed: Type.Integer({ minimum: 0, maximum: 3, description: "Manual cooking speed. Left rotation is limited to speed 0-3." }),
    rotationDirection: Type.Literal("left", { description: "Blade direction for manual cooking." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaManualCookingHeating = Type.Object(
  {
    type: Type.Literal("manualCooking"),
    temperature: NonZeroHeatingTemperatureSchema,
    ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
    speed: Type.Integer({ minimum: 0, maximum: 3, description: "Manual cooking speed. Heating is limited to speed 0-3." }),
    rotationDirection: Type.Union([Type.Literal("left"), Type.Literal("right")], { description: "Blade direction for manual cooking." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaTurbo = Type.Object(
  {
    type: Type.Literal("turbo"),
    seconds: Type.Integer({ minimum: 1, maximum: 20, description: "Turbo duration in seconds." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaScale = Type.Object(
  {
    type: Type.Literal("scale"),
    grams: Type.Integer({ minimum: 5, maximum: 5000, description: "Target weight for scale mode." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaRoast = Type.Object(
  {
    type: Type.Literal("roast"),
    temperature: HeatingTemperatureSchema,
    ...timeFields(14, "Whole minutes for roasting. Combined time must be 0-840 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSolidDoughKnead = Type.Object(
  {
    type: Type.Literal("solidDoughKnead"),
    ...timeFields(4, "Whole minutes for solid dough kneading. Combined time must be 45-240 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSoftDoughKnead = Type.Object(
  {
    type: Type.Literal("softDoughKnead"),
    ...timeFields(4, "Whole minutes for soft dough kneading. Combined time must be 45-240 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaLiquidDoughKnead = Type.Object(
  {
    type: Type.Literal("liquidDoughKnead"),
    ...timeFields(6, "Whole minutes for liquid dough kneading. Combined time must be 45-360 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSteam = Type.Object(
  {
    type: Type.Literal("steam"),
    ...timeFields(60, "Whole minutes for steaming. Combined time must be 0-3600 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSousVide = Type.Object(
  {
    type: Type.Literal("sousVide"),
    temperature: Type.Integer({ minimum: 40, maximum: 85, description: "Sous-vide temperature in C." }),
    ...timeFields(720, "Whole minutes for sous-vide. Combined time must be 15-720 minutes.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSlowCooking = Type.Object(
  {
    type: Type.Literal("slowCooking"),
    temperature: LowTemperatureSchema,
    ...timeFields(480, "Whole minutes for slow cooking. Combined time must be 15-480 minutes.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaCookingEggs = Type.Object(
  {
    type: Type.Literal("cookingEggs"),
    size: Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")], { description: "Egg size." }),
    texture: Type.Union([Type.Literal("soft"), Type.Literal("waxy_soft"), Type.Literal("hard")], {
      description: "Egg result. Use waxy_soft for medium/soft-boiled."
    })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaPrecleaning = Type.Object(
  {
    type: Type.Literal("precleaning"),
    duration: Type.Union([Type.Literal("short"), Type.Literal("long")], { description: "Precleaning duration." })
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaFermentation = Type.Object(
  {
    type: Type.Literal("fermentation"),
    temperature: FermentationTemperatureSchema,
    ...timeFields(720, "Whole minutes for fermentation. Combined time must be 30-720 minutes.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaRiceCooking = Type.Object(
  {
    type: Type.Literal("riceCooking"),
    ...timeFields(40, "Whole minutes for rice cooking. Combined time must be 1200-2400 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaFoodProcessor = Type.Object(
  {
    type: Type.Literal("foodProcessor"),
    ...timeFields(5, "Whole minutes for food processor mode. Combined time must be 1-300 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaPuree = Type.Object(
  {
    type: Type.Literal("puree"),
    ...timeFields(2, "Whole minutes for puree mode. Combined time must be 30-120 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchemaSmoothie = Type.Object(
  {
    type: Type.Literal("smoothie"),
    ...timeFields(2, "Whole minutes for smoothie mode. Combined time must be 30-120 seconds.")
  },
  ModeObjectOptions
);

const RecipeStepModeSchema = Type.Union([
  RecipeStepModeSchemaNone,
  RecipeStepModeSchemaScale,
  RecipeStepModeSchemaTurbo,
  RecipeStepModeSchemaManualCookingRight,
  RecipeStepModeSchemaManualCookingLeft,
  RecipeStepModeSchemaManualCookingHeating,
  RecipeStepModeSchemaRoast,
  RecipeStepModeSchemaSolidDoughKnead,
  RecipeStepModeSchemaSoftDoughKnead,
  RecipeStepModeSchemaLiquidDoughKnead,
  RecipeStepModeSchemaSteam,
  RecipeStepModeSchemaSousVide,
  RecipeStepModeSchemaSlowCooking,
  RecipeStepModeSchemaCookingEggs,
  RecipeStepModeSchemaPrecleaning,
  RecipeStepModeSchemaFermentation,
  RecipeStepModeSchemaRiceCooking,
  RecipeStepModeSchemaFoodProcessor,
  RecipeStepModeSchemaPuree,
  RecipeStepModeSchemaSmoothie
], {
  description: "Discriminated Smart mode settings. Each mode type only accepts the fields that mode uses."
});

const RecipeStepSchema = Type.Union([
  Type.Object(
    {
      title: Type.String({ minLength: 1, maxLength: 80, description: "Step title in the target locale." }),
      description: Type.String({
        maxLength: 240,
        description: "Step instruction. Allowed and expected for none, scale, and turbo modes."
      }),
      mode: Type.Union([
        RecipeStepModeSchemaNone,
        RecipeStepModeSchemaScale,
        RecipeStepModeSchemaTurbo
      ])
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      title: Type.String({
        minLength: 1,
        maxLength: 80,
        description: "Step title/instruction. For cooking/processing modes, the description must be empty."
      }),
      description: Type.Optional(Type.Literal("", { description: "Must be empty for automatic modes." })),
      mode: Type.Union([
        RecipeStepModeSchemaManualCookingRight,
        RecipeStepModeSchemaManualCookingLeft,
        RecipeStepModeSchemaManualCookingHeating,
        RecipeStepModeSchemaRoast,
        RecipeStepModeSchemaSolidDoughKnead,
        RecipeStepModeSchemaSoftDoughKnead,
        RecipeStepModeSchemaLiquidDoughKnead,
        RecipeStepModeSchemaSteam,
        RecipeStepModeSchemaSousVide,
        RecipeStepModeSchemaSlowCooking,
        RecipeStepModeSchemaCookingEggs,
        RecipeStepModeSchemaPrecleaning,
        RecipeStepModeSchemaFermentation,
        RecipeStepModeSchemaRiceCooking,
        RecipeStepModeSchemaFoodProcessor,
        RecipeStepModeSchemaPuree,
        RecipeStepModeSchemaSmoothie
      ])
    },
    { additionalProperties: false }
  )
]);

const LocalizedSettingsSchema = Type.Union([
  Type.Object({
    locale: Type.Literal("cs-CZ"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["cs-CZ"].easy),
      Type.Literal(localeComplexityIds["cs-CZ"].medium),
      Type.Literal(localeComplexityIds["cs-CZ"].hard)
    ], { description: `Czech complexity: ${localeComplexityIds["cs-CZ"].easy} (easy), ${localeComplexityIds["cs-CZ"].medium} (medium), ${localeComplexityIds["cs-CZ"].hard} (hard)` })
  }, { additionalProperties: false }),
  Type.Object({
    locale: Type.Literal("pl-PL"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["pl-PL"].easy),
      Type.Literal(localeComplexityIds["pl-PL"].medium),
      Type.Literal(localeComplexityIds["pl-PL"].hard)
    ], { description: `Polish complexity: ${localeComplexityIds["pl-PL"].easy} (easy), ${localeComplexityIds["pl-PL"].medium} (medium), ${localeComplexityIds["pl-PL"].hard} (hard)` })
  }, { additionalProperties: false }),
  Type.Object({
    locale: Type.Literal("de-DE"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["de-DE"].easy),
      Type.Literal(localeComplexityIds["de-DE"].medium),
      Type.Literal(localeComplexityIds["de-DE"].hard)
    ], { description: `German complexity: ${localeComplexityIds["de-DE"].easy} (easy), ${localeComplexityIds["de-DE"].medium} (medium), ${localeComplexityIds["de-DE"].hard} (hard)` })
  }, { additionalProperties: false }),
  Type.Object({
    locale: Type.Literal("fr-FR"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["fr-FR"].easy),
      Type.Literal(localeComplexityIds["fr-FR"].medium),
      Type.Literal(localeComplexityIds["fr-FR"].hard)
    ], { description: `French complexity: ${localeComplexityIds["fr-FR"].easy} (easy), ${localeComplexityIds["fr-FR"].medium} (medium), ${localeComplexityIds["fr-FR"].hard} (hard)` })
  }, { additionalProperties: false }),
  Type.Object({
    locale: Type.Literal("en-US"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["en-US"].easy),
      Type.Literal(localeComplexityIds["en-US"].medium),
      Type.Literal(localeComplexityIds["en-US"].hard)
    ], { description: `English complexity: ${localeComplexityIds["en-US"].easy} (easy), ${localeComplexityIds["en-US"].medium} (medium), ${localeComplexityIds["en-US"].hard} (hard)` })
  }, { additionalProperties: false }),
  Type.Object({
    locale: Type.Literal("it-IT"),
    complexityId: Type.Union([
      Type.Literal(localeComplexityIds["it-IT"].easy),
      Type.Literal(localeComplexityIds["it-IT"].medium),
      Type.Literal(localeComplexityIds["it-IT"].hard)
    ], { description: `Italian complexity: ${localeComplexityIds["it-IT"].easy} (easy), ${localeComplexityIds["it-IT"].medium} (medium), ${localeComplexityIds["it-IT"].hard} (hard)` })
  }, { additionalProperties: false })
], {
  description: "Settings object containing target locale and complexity ID."
});

/**
 * Supported locales for Monsieur Cuisine Smart recipe generation.
 */
export const SupportedLocaleSchema = Type.Union([
  Type.Literal("cs-CZ"),
  Type.Literal("pl-PL"),
  Type.Literal("de-DE"),
  Type.Literal("fr-FR"),
  Type.Literal("en-US"),
  Type.Literal("it-IT")
]);

/**
 * Shared sub-schema for recipe nutrient information.
 */
export const NutrientSchema = Type.Object(
  {
    name: Type.Union([
      Type.Literal("calories"),
      Type.Literal("carbohydrate"),
      Type.Literal("fat"),
      Type.Literal("protein")
    ]),
    unit: Type.String({ description: "Use kCal for calories and g for carbohydrate, fat and protein." }),
    amount: Type.Integer({
      minimum: 0,
      description: "Monsieur Cuisine requires nutrient amounts as whole integer numbers. Round sensible estimates."
    })
  },
  { additionalProperties: false, description: "Shared schema for recipe nutrient information." }
);

/**
 * Shared sub-schema for individual recipe ingredients.
 */
export const RecipeIngredientSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    amount: Type.Union([Type.String(), Type.Number()], {
      description: "Ingredient amount. Fractions and ranges may be strings."
    }),
    unit: Type.String({ maxLength: 30, description: "Ingredient unit in the target locale. Prefer g and kg for weighable ingredients; use localized spoon, pinch, piece or volume units only when they are clearer." }),
    isOptional: Type.Boolean({ description: "True only when the ingredient is explicitly optional." })
  },
  { additionalProperties: false, description: "Shared schema for recipe ingredient items." }
);

/**
 * Shared sub-schema for groups of ingredients (e.g. 'For the dough').
 */
export const RecipeIngredientGroupSchema = Type.Object(
  {
    name: Type.String({ maxLength: 80 }),
    ingredients: Type.Array(RecipeIngredientSchema, { minItems: 1 })
  },
  { additionalProperties: false, description: "Shared schema for grouped ingredients." }
);

/**
 * ============================================================================
 * DUAL-SCHEMA ARCHITECTURE
 * ============================================================================
 * 
 * To ensure high-quality recipe generation and robust execution, this application
 * uses two distinct JSON schemas representing validation boundaries at different levels:
 * 
 * 1. Model-Optimized Input Schema (RecipeInputSchema):
 *    - Designed specifically for LLM Structured Outputs (OpenAI Strict Mode).
 *    - Flattened, simplified, and excludes platform-specific boilerplate.
 *    - Optimizes token usage, prevents structure/syntax mistakes by the model, 
 *      and makes validation feedback straightforward for auto-correction loops.
 * 
 * 2. API-Optimized Payload Schema (SmartRecipePayloadSchema):
 *    - Mirrors the exact, database-ready JSON format consumed by the Monsieur Cuisine API.
 *    - Enforces technical constraints like exact hardware IDs (deviceTypeIds: [13]),
 *      tuple arrays, order indices, stringified numbers, and specific nested shapes.
 * 
 * Utilizing both schemas ensures type-safety at the generation boundary (validating 
 * model outputs) and the transmission boundary (validating payloads before sending them).
 */

export const RecipeInputSchema = Type.Object(
  {
    title: Type.String({
      minLength: 1,
      maxLength: 120,
      description: "Recipe title in the target locale. Keep it concise and publishable."
    }),
    description: Type.String({
      maxLength: 2000,
      description: "Original, paraphrased recipe description. This can be more verbose than step text."
    }),
    settings: LocalizedSettingsSchema,
    status: Type.Optional(Type.Union([Type.Literal("draft"), Type.Literal("private-publish")], {
      description: "Draft is safest for generated recipes."
    })),
    categoryIds: Type.Array(
      Type.Union([
        Type.Literal(220),
        Type.Literal(228),
        Type.Literal(236),
        Type.Literal(244),
        Type.Literal(252),
        Type.Literal(260),
        Type.Literal(268),
        Type.Literal(276),
        Type.Literal(284),
        Type.Literal(308),
        Type.Literal(316),
        Type.Literal(324),
        Type.Literal(332),
        Type.Literal(340),
        Type.Literal(348),
        Type.Literal(471),
        Type.Literal(472),
        Type.Literal(473),
        Type.Literal(498),
        Type.Literal(499),
        Type.Literal(554),
        Type.Literal(579),
        Type.Literal(588)
      ]),
      {
        description: `Category IDs. Available categories: ${Object.entries(categoryMeta)
          .map(([key, meta]) => `${meta.id} (${key}: ${meta.description})`)
          .join(", ")}.`,
        minItems: 0,
        maxItems: 8,
        uniqueItems: true
      }
    ),
    nutrients: Type.Array(NutrientSchema, {
      description: "Estimated nutrients per serving. Make a reasonable estimate when the source omits them."
    }),
    servingSize: Type.Object(
      {
        amount: Type.Integer({ minimum: 1, maximum: 24, description: "Number of servings or units." }),
        unit: Type.String({ minLength: 1, maxLength: 40, description: "Serving unit in the target locale, for example servings, portions, jars, pieces or the local equivalents." }),
        instruction: Type.String({ maxLength: 4000, description: "Complete, continuous textual recipe instructions for human reading (non-guided alternative)." }),
        preparationTime: Type.Integer({ minimum: 1, maximum: 1440, description: "Hands-on preparation time in minutes." }),
        readyInTime: Type.Integer({ minimum: 1, maximum: 2880, description: "Total time until ready, in minutes." }),
        ingredientGroups: Type.Array(RecipeIngredientGroupSchema, { minItems: 1 }),
        steps: Type.Array(
          RecipeStepSchema,
          { minItems: 1 }
        )
      },
      { additionalProperties: false }
    )
  },
  {
    $id: "https://github.com/smart-recipe/smart-recipe/schemas/recipe-input.json",
    additionalProperties: false,
    description: "High-level, model-friendly recipe input for Monsieur Cuisine Smart (MC3.0)."
  }
);

export type RecipeInput = Static<typeof RecipeInputSchema>;

const RawDeviceSettingSchema = Type.Object(
  {
    order: Type.Integer({ minimum: 0 }),
    time: Type.Optional(Type.Integer({ minimum: 0 })),
    temperature: Type.Optional(Type.Integer({ minimum: 0 })),
    speed: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })),
    clockwise: Type.Optional(Type.Boolean()),
    weight: Type.Optional(Type.Integer({ minimum: 0 }))
  },
  { additionalProperties: false }
);

/**
 * API-specific representation of a Monsieur Cuisine Smart device mode.
 */
export const RawSmartModeSchema = Type.Union([
  Type.Null(),
  Type.Object(
    {
      type: Type.String(),
      modeSetting: Type.Null(),
      deviceSettings: Type.Array(RawDeviceSettingSchema, { minItems: 1, maxItems: 1 })
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      type: Type.Literal("cooking_eggs"),
      modeSetting: Type.Object(
        {
          size: Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")]),
          texture: Type.Union([Type.Literal("soft"), Type.Literal("waxy_soft"), Type.Literal("hard")])
        },
        { additionalProperties: false }
      )
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      type: Type.Literal("precleaning"),
      modeSetting: Type.Object(
        {
          duration: Type.Union([Type.Literal("short"), Type.Literal("long")])
        },
        { additionalProperties: false }
      )
    },
    { additionalProperties: false }
  )
]);

const RawIngredientSchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    isOptional: Type.Boolean(),
    unit: Type.String(),
    amount: Type.String(),
    systemIngredientId: Type.Null(),
    order: Type.Integer(),
    ingredientCategory: Type.Null(),
    iconUrl: Type.Null()
  },
  { additionalProperties: false }
);

const RawIngredientGroupSchema = Type.Object(
  {
    name: Type.String(),
    isDefault: Type.Boolean(),
    order: Type.Integer(),
    ingredients: Type.Array(RawIngredientSchema, { minItems: 1 })
  },
  { additionalProperties: false }
);

const RawStepSchema = Type.Object(
  {
    title: Type.String({ maxLength: 80 }),
    description: Type.String({ maxLength: 240 }),
    duration: Type.Null(),
    mode: RawSmartModeSchema,
    videoMedia: Type.Null(),
    order: Type.Integer()
  },
  { additionalProperties: false }
);

/**
 * Schema representing the raw API payload consumed by Monsieur Cuisine Smart.
 */
export const SmartRecipePayloadSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("draft"), Type.Literal("private-publish")]),
    source: Type.Literal("member"),
    languageLocale: SupportedLocaleSchema,
    deviceTypeIds: Type.Array(Type.Literal(13), { minItems: 1, maxItems: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.String(),
    thumbnail: Type.Object(
      {
        portraitMediaId: Type.Union([Type.Integer(), Type.Null()]),
        landscapeMediaId: Type.Union([Type.Integer(), Type.Null()])
      },
      { additionalProperties: false }
    ),
    detailsImage: Type.Object(
      {
        portraitMediaId: Type.Union([Type.Integer(), Type.Null()]),
        landscapeMediaId: Type.Union([Type.Integer(), Type.Null()])
      },
      { additionalProperties: false }
    ),
    complexityId: Type.Integer(),
    allowSocialSharing: Type.Literal(false),
    categoryIds: Type.Array(Type.Integer()),
    nutrients: Type.Array(NutrientSchema),
    servingSizes: Type.Array(
      Type.Object(
        {
          amount: Type.Integer({ minimum: 1 }),
          maxServing: Type.Null(),
          instruction: Type.String(),
          unit: Type.String(),
          isDefault: Type.Literal(true),
          preparationTime: Type.Integer(),
          readyInTime: Type.Integer(),
          ingredientGroups: Type.Array(RawIngredientGroupSchema),
          steps: Type.Array(RawStepSchema),
          order: Type.Literal(0)
        },
        { additionalProperties: false }
      ),
      { minItems: 1, maxItems: 1 }
    )
  },
  {
    $id: "https://github.com/smart-recipe/smart-recipe/schemas/recipe-payload.json",
    additionalProperties: false,
    description: "API-specific recipe payload structure required by Monsieur Cuisine Smart (MC3.0)."
  }
);

export type SmartRecipePayload = Static<typeof SmartRecipePayloadSchema>;

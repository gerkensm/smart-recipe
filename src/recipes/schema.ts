import Type, { type Static } from "typebox";
import { categoryKeys } from "../catalogs/catalogs.js";
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

const RecipeStepModeSchema = Type.Union(
  [
    Type.Object(
      {
        type: Type.Literal("none", { description: "Human-only instruction without an automatic Smart mode." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("manualCooking"),
        temperature: Type.Literal(0),
        ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
        speed: Type.Integer({ minimum: 0, maximum: 10, description: "Manual cooking speed without heating and with right rotation." }),
        rotationDirection: Type.Literal("right", { description: "Blade direction for manual cooking." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("manualCooking"),
        temperature: Type.Literal(0),
        ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
        speed: Type.Integer({ minimum: 0, maximum: 3, description: "Manual cooking speed. Left rotation is limited to speed 0-3." }),
        rotationDirection: Type.Literal("left", { description: "Blade direction for manual cooking." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("manualCooking"),
        temperature: NonZeroHeatingTemperatureSchema,
        ...timeFields(99, "Whole minutes for manual cooking. Combined time must be 1-5940 seconds."),
        speed: Type.Integer({ minimum: 0, maximum: 3, description: "Manual cooking speed. Heating is limited to speed 0-3." }),
        rotationDirection: Type.Union([Type.Literal("left"), Type.Literal("right")], { description: "Blade direction for manual cooking." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("turbo"),
        seconds: Type.Integer({ minimum: 1, maximum: 20, description: "Turbo duration in seconds." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("scale"),
        grams: Type.Integer({ minimum: 5, maximum: 5000, description: "Target weight for scale mode." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("roast"),
        temperature: HeatingTemperatureSchema,
        ...timeFields(14, "Whole minutes for roasting. Combined time must be 0-840 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("solidDoughKnead"),
        ...timeFields(4, "Whole minutes for solid dough kneading. Combined time must be 45-240 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("softDoughKnead"),
        ...timeFields(4, "Whole minutes for soft dough kneading. Combined time must be 45-240 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("liquidDoughKnead"),
        ...timeFields(6, "Whole minutes for liquid dough kneading. Combined time must be 45-360 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("steam"),
        ...timeFields(60, "Whole minutes for steaming. Combined time must be 0-3600 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("sousVide"),
        temperature: Type.Integer({ minimum: 40, maximum: 85, description: "Sous-vide temperature in C." }),
        ...timeFields(720, "Whole minutes for sous-vide. Combined time must be 15-720 minutes.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("slowCooking"),
        temperature: LowTemperatureSchema,
        ...timeFields(480, "Whole minutes for slow cooking. Combined time must be 15-480 minutes.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("cookingEggs"),
        size: Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")], { description: "Egg size." }),
        texture: Type.Union([Type.Literal("soft"), Type.Literal("waxy_soft"), Type.Literal("hard")], {
          description: "Egg result. Use waxy_soft for medium/soft-boiled."
        })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("precleaning"),
        duration: Type.Union([Type.Literal("short"), Type.Literal("long")], { description: "Precleaning duration." })
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("fermentation"),
        temperature: FermentationTemperatureSchema,
        ...timeFields(720, "Whole minutes for fermentation. Combined time must be 30-720 minutes.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("riceCooking"),
        ...timeFields(40, "Whole minutes for rice cooking. Combined time must be 1200-2400 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("foodProcessor"),
        ...timeFields(5, "Whole minutes for food processor mode. Combined time must be 1-300 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("puree"),
        ...timeFields(2, "Whole minutes for puree mode. Combined time must be 30-120 seconds.")
      },
      ModeObjectOptions
    ),
    Type.Object(
      {
        type: Type.Literal("smoothie"),
        ...timeFields(2, "Whole minutes for smoothie mode. Combined time must be 30-120 seconds.")
      },
      ModeObjectOptions
    )
  ],
  {
    description: "Discriminated Smart mode settings. Each mode type only accepts the fields that mode uses."
  }
);

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
    locale: Type.Union(
      [
        Type.Literal("cs-CZ"),
        Type.Literal("pl-PL"),
        Type.Literal("de-DE"),
        Type.Literal("fr-FR"),
        Type.Literal("en-US"),
        Type.Literal("it-IT")
      ],
      {
        description:
          "Target locale. Use the locale that matches the recipe language. The package currently bundles verified Smart catalogs for cs-CZ, pl-PL, de-DE, fr-FR, en-US and it-IT."
      }
    ),
    status: Type.Optional(Type.Union([Type.Literal("draft"), Type.Literal("private-publish")], {
      description: "Draft is safest for generated recipes."
    })),
    complexity: Type.Union([Type.Literal("easy"), Type.Literal("medium"), Type.Literal("hard")], {
      description: "Difficulty level mapped to the locale-specific Monsieur Cuisine complexity id."
    }),
    categoryKeys: Type.Array(Type.Union(categoryKeys.map((key) => Type.Literal(key))), {
      description: `Semantic category keys. The library maps these to locale-specific Monsieur Cuisine category ids. Available keys: ${categoryKeys.join(", ")}. Locale-specific ids and labels are included in prompt hints.`,
      minItems: 0,
      maxItems: 8
    }),
    nutrients: Type.Array(
      Type.Object(
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
        { additionalProperties: false }
      ),
      { description: "Estimated nutrients per serving. Make a reasonable estimate when the source omits them." }
    ),
    servingSize: Type.Object(
      {
        amount: Type.Integer({ minimum: 1, maximum: 24, description: "Number of servings or units." }),
        unit: Type.String({ minLength: 1, maxLength: 40, description: "Serving unit in the target locale, for example servings, portions, jars, pieces or the local equivalents." }),
        instruction: Type.String({ maxLength: 240, description: "Optional serving-size note." }),
        preparationTime: Type.Integer({ minimum: 1, maximum: 1440, description: "Hands-on preparation time in minutes." }),
        readyInTime: Type.Integer({ minimum: 1, maximum: 2880, description: "Total time until ready, in minutes." }),
        ingredientGroups: Type.Array(
          Type.Object(
            {
              name: Type.String({ maxLength: 80 }),
              ingredients: Type.Array(
                Type.Object(
                  {
                    name: Type.String({ minLength: 1, maxLength: 120 }),
                    amount: Type.Union([Type.String(), Type.Number()], {
                      description: "Ingredient amount. Fractions and ranges may be strings."
                    }),
                    unit: Type.String({ maxLength: 30, description: "Ingredient unit in the target locale. Prefer g and kg for weighable ingredients; use localized spoon, pinch, piece or volume units only when they are clearer." }),
                    isOptional: Type.Boolean({ description: "True only when the ingredient is explicitly optional." })
                  },
                  { additionalProperties: false }
                ),
                { minItems: 1 }
              )
            },
            { additionalProperties: false }
          ),
          { minItems: 1 }
        ),
        steps: Type.Array(
          Type.Object(
            {
              title: Type.String({ minLength: 1, maxLength: 80 }),
              description: Type.String({ maxLength: 240, description: "Step instruction. Must fit the Monsieur Cuisine UI, so stay under 240 characters." }),
              mode: RecipeStepModeSchema
            },
            { additionalProperties: false }
          ),
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

import Type, { type Static } from "typebox";
import { categoryKeys } from "../catalogs/catalogs.js";
import { SMART_HEATING_TEMPERATURE_STEPS, SMART_PROMPT_MODE_NAMES } from "./constants.js";

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
              mode: Type.Object(
                {
                  type: Type.Union(SMART_PROMPT_MODE_NAMES.map((mode) => Type.Literal(mode)), {
                    description: "Semantic Smart mode. Use none for human-only instructions."
                  }),
                  temperature: Type.Optional(Type.Integer({
                    minimum: 0,
                    maximum: 130,
                    description: `Temperature in C. For manualCooking and roast use one of: ${SMART_HEATING_TEMPERATURE_STEPS.join(", ")}. For sousVide use 40-85. For fermentation use 37,40,45,50,55,60,65.`
                  })),
                  minutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 720, description: "Whole minutes for the automatic mode." })),
                  seconds: Type.Optional(Type.Integer({ minimum: 0, maximum: 59, description: "Remaining seconds for the automatic mode." })),
                  speed: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, description: "Manual cooking speed. When heating, use 0-3." })),
                  rotationDirection: Type.Optional(Type.Union([Type.Literal("left"), Type.Literal("right")], { description: "Blade direction for manual cooking." })),
                  grams: Type.Optional(Type.Integer({ minimum: 5, maximum: 5000, description: "Target weight for scale mode." })),
                  size: Type.Optional(Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")], { description: "Egg size for cookingEggs." })),
                  texture: Type.Optional(Type.Union([Type.Literal("soft"), Type.Literal("waxy_soft"), Type.Literal("hard")], { description: "Egg result for cookingEggs. Use waxy_soft for medium/soft-boiled." })),
                  duration: Type.Optional(Type.Union([Type.Literal("short"), Type.Literal("long")], { description: "Precleaning duration." }))
                },
                {
                  additionalProperties: false,
                  description: "Mode settings in a model-friendly shape. The library converts this into the raw Monsieur Cuisine mode payload."
                }
              )
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

import { describe, expect, it } from "vitest";
import type { RecipeInput, RecipeStepInput, SmartRecipeInput } from "../src/recipes/index.js";

describe("Recipe TypeScript Types", () => {
  it("allows correct fields for steps with descriptions", () => {
    // positive cases: manual/none, scale, turbo
    const manualStep: RecipeStepInput = {
      title: "Add ingredients",
      description: "Put 200g of flour and 100g of sugar into the mixing bowl.",
      mode: { type: "none" as const }
    };
    expect(manualStep.title).toBe("Add ingredients");
    expect(manualStep.description).toBe("Put 200g of flour and 100g of sugar into the mixing bowl.");

    const scaleStep: RecipeStepInput = {
      title: "Weigh sugar",
      description: "Pour sugar slowly until 100g is reached.",
      mode: { type: "scale" as const, grams: 100 }
    };
    expect(scaleStep.mode.type).toBe("scale");

    const turboStep: RecipeStepInput = {
      title: "Chop nuts",
      description: "Hold the turbo button twice.",
      mode: { type: "turbo" as const, seconds: 5 }
    };
    expect(turboStep.mode.type).toBe("turbo");
  });

  it("allows empty or omitted descriptions for automatic/cooking modes", () => {
    // positive cases: manualCooking with empty description
    const cookingStepEmptyDesc: RecipeStepInput = {
      title: "Cook sauce",
      description: "" as const,
      mode: {
        type: "manualCooking" as const,
        temperature: 100 as const,
        minutes: 10,
        seconds: 0,
        speed: 2,
        rotationDirection: "right" as const
      }
    };
    expect(cookingStepEmptyDesc.description).toBe("");

    // positive cases: manualCooking with omitted description
    const cookingStepOmittedDesc: RecipeStepInput = {
      title: "Cook sauce",
      mode: {
        type: "manualCooking" as const,
        temperature: 100 as const,
        minutes: 10,
        seconds: 0,
        speed: 2,
        rotationDirection: "right" as const
      }
    };
    expect(cookingStepOmittedDesc.description).toBeUndefined();

    // other cooking modes (omitted descriptions)
    const roastStep: RecipeStepInput = {
      title: "Roast onions",
      mode: {
        type: "roast" as const,
        temperature: 120 as const,
        minutes: 5,
        seconds: 0
      }
    };
    expect(roastStep.mode.type).toBe("roast");

    const eggStep: RecipeStepInput = {
      title: "Boil eggs",
      mode: {
        type: "cookingEggs" as const,
        size: "medium" as const,
        texture: "waxy_soft" as const
      }
    };
    expect(eggStep.mode.type).toBe("cookingEggs");

    const slowStep: RecipeStepInput = {
      title: "Slow cook beef",
      mode: {
        type: "slowCooking" as const,
        temperature: 95 as const,
        minutes: 240,
        seconds: 0
      }
    };
    expect(slowStep.mode.type).toBe("slowCooking");
  });

  it("enforces type-level constraints with negative compiler assertions", () => {
    // We use @ts-expect-error comment directives to verify that the TypeScript
    // compiler correctly flags invalid assignments. If these lines compile without
    // errors, the type check step will fail with "Unused @ts-expect-error directive".

    // 1. None/Scale/Turbo must have descriptions (description is a required field for these)
    // @ts-expect-error - description is required for "none" mode step
    const _invalidNoneMissingDesc: RecipeStepInput = {
      title: "Missing Description",
      mode: { type: "none" as const }
    };

    // @ts-expect-error - description is required for "scale" mode step
    const _invalidScaleMissingDesc: RecipeStepInput = {
      title: "Missing Description",
      mode: { type: "scale" as const, grams: 100 }
    };

    // @ts-expect-error - description is required for "turbo" mode step
    const _invalidTurboMissingDesc: RecipeStepInput = {
      title: "Missing Description",
      mode: { type: "turbo" as const, seconds: 5 }
    };

    // 2. Cooking/processing modes must NOT have non-empty descriptions
    // @ts-expect-error - manualCooking description must be empty string if provided
    const _invalidCookingDesc: RecipeStepInput = {
      title: "Cook something",
      description: "Non-empty description not allowed",
      mode: {
        type: "manualCooking" as const,
        temperature: 100 as const,
        minutes: 10,
        seconds: 0,
        speed: 2,
        rotationDirection: "right" as const
      }
    };

    // @ts-expect-error - roast description must be empty string if provided
    const _invalidRoastDesc: RecipeStepInput = {
      title: "Roast something",
      description: "Non-empty description not allowed",
      mode: {
        type: "roast" as const,
        temperature: 120 as const,
        minutes: 5,
        seconds: 0
      }
    };

    // @ts-expect-error - slowCooking description must be empty string if provided
    const _invalidSlowCookingDesc: RecipeStepInput = {
      title: "Slow cook something",
      description: "Non-empty description not allowed",
      mode: {
        type: "slowCooking" as const,
        temperature: 95 as const,
        minutes: 120,
        seconds: 0
      }
    };

    // 3. Temperature validation constraints on manualCooking
    const _invalidTempStep: RecipeStepInput = {
      title: "Cook something",
      mode: {
        type: "manualCooking" as const,
        // @ts-expect-error - temperature 42 is not in SMART_HEATING_TEMPERATURE_STEPS
        temperature: 42,
        minutes: 5,
        seconds: 0,
        speed: 1,
        rotationDirection: "right" as const
      }
    };

    // 4. Direction validation constraints
    const _invalidDirection: RecipeStepInput = {
      title: "Cook something",
      mode: {
        type: "manualCooking" as const,
        temperature: 100 as const,
        minutes: 5,
        seconds: 0,
        speed: 1,
        // @ts-expect-error - rotationDirection must be "left" or "right"
        rotationDirection: "backward" // Invalid direction
      }
    };

    expect(_invalidNoneMissingDesc).toBeDefined();
    expect(_invalidScaleMissingDesc).toBeDefined();
    expect(_invalidTurboMissingDesc).toBeDefined();
    expect(_invalidCookingDesc).toBeDefined();
    expect(_invalidRoastDesc).toBeDefined();
    expect(_invalidSlowCookingDesc).toBeDefined();
    expect(_invalidTempStep).toBeDefined();
    expect(_invalidDirection).toBeDefined();
  });

  it("asserts Nutrient type validation", () => {
    // Valid nutrients
    const validNutrients: SmartRecipeInput["nutrients"] = [
      { name: "calories", unit: "kCal", amount: 100 },
      { name: "fat", unit: "g", amount: 10 }
    ];
    expect(validNutrients.length).toBe(2);

    // Invalid nutrient name
    const _invalidNutrients: SmartRecipeInput["nutrients"] = [
      // @ts-expect-error - "sugar" is not a valid nutrient name
      { name: "sugar", unit: "g", amount: 15 }
    ];
    expect(_invalidNutrients).toBeDefined();
  });
});

describe("RecipeInput General Schema Types", () => {
  it("enforces locale setting constraints", () => {
    // Positive cases
    const validGermanSettings: RecipeInput["settings"] = {
      locale: "de-DE" as const,
      complexityId: 142
    };
    const validEnglishSettings: RecipeInput["settings"] = {
      locale: "en-US" as const,
      complexityId: 22
    };
    expect(validGermanSettings.locale).toBe("de-DE");
    expect(validEnglishSettings.locale).toBe("en-US");

    // Negative cases
    const _invalidLocale: RecipeInput["settings"] = {
      // @ts-expect-error - locale "xx-XX" is not a SupportedLocale
      locale: "xx-XX",
      complexityId: 142
    };

    expect(_invalidLocale).toBeDefined();
  });

  it("enforces categoryIds validation constraints", () => {
    // Positive cases
    const validCategories: RecipeInput["categoryIds"] = [220, 579]; // Sauces & Vegan
    expect(validCategories).toEqual([220, 579]);

    // Negative cases
    // @ts-expect-error - categoryId 999 is not a supported category ID in the schema
    const _invalidCategories: RecipeInput["categoryIds"] = [999];

    expect(_invalidCategories).toBeDefined();
  });

  it("enforces complete RecipeInput validation", () => {
    // Positive cases: complete valid recipe input
    const validRecipe: RecipeInput = {
      title: "Valid Recipe",
      description: "A valid recipe description",
      settings: {
        locale: "de-DE" as const,
        complexityId: 142 as const
      },
      status: "draft" as const,
      categoryIds: [220, 579],
      nutrients: [
        { name: "calories" as const, unit: "kCal", amount: 100 },
        { name: "fat" as const, unit: "g", amount: 10 }
      ],
      servingSize: {
        amount: 4,
        unit: "portions",
        instruction: "",
        preparationTime: 10,
        readyInTime: 30,
        ingredientGroups: [
          {
            name: "Main ingredients",
            ingredients: [
              { name: "Sugar", amount: 50, unit: "g", isOptional: false }
            ]
          }
        ],
        steps: [
          {
            title: "Preparation",
            description: "Put ingredients in bowl.",
            mode: { type: "none" as const }
          }
        ]
      }
    };
    expect(validRecipe.title).toBe("Valid Recipe");

    // Negative cases: missing required fields
    // @ts-expect-error - title is a required field in RecipeInput
    const _missingTitle: RecipeInput = {
      description: "Description",
      settings: {
        locale: "de-DE" as const,
        complexityId: 142 as const
      },
      servingSize: {
        amount: 4,
        unit: "portions",
        instruction: "",
        preparationTime: 10,
        readyInTime: 30,
        ingredientGroups: [],
        steps: []
      }
    };

    // @ts-expect-error - servingSize is a required field in RecipeInput
    const _missingServingSize: RecipeInput = {
      title: "Missing serving size",
      settings: {
        locale: "de-DE" as const,
        complexityId: 142 as const
      }
    };

    expect(_missingTitle).toBeDefined();
    expect(_missingServingSize).toBeDefined();
  });
});

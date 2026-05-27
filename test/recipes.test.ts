import { describe, expect, it } from "vitest";
import { getCatalog } from "../src/catalogs/index.js";
import { createRecipeUrl } from "../src/mc/urls.js";
import { createSmartRecipePayload } from "../src/recipes/payload.js";
import type { CreateSmartRecipePayloadOptions } from "../src/recipes/payload.js";
import { validateRecipeInput } from "../src/recipes/validation.js";
import type { RecipeStepInput } from "../src/recipes/types.js";

const recipeInput: CreateSmartRecipePayloadOptions = {
  title: "Tomatensauce",
  description: "Eine einfache Sauce.",
  settings: {
    locale: "de-DE" as const,
    complexityId: 142
  },
  categoryIds: [220, 579],
  nutrients: [
    { name: "calories" as const, unit: "kCal", amount: 120 },
    { name: "carbohydrate" as const, unit: "g", amount: 10 },
    { name: "fat" as const, unit: "g", amount: 8 },
    { name: "protein" as const, unit: "g", amount: 2 }
  ],
  servingSize: {
    amount: 2,
    unit: "Portionen",
    instruction: "",
    preparationTime: 5,
    readyInTime: 20,
    ingredientGroups: [
      {
        name: "Zutaten",
        ingredients: [{ name: "Tomaten", amount: 400, unit: "g", isOptional: false }]
      }
    ],
    steps: [
      {
        title: "Tomaten vorbereiten",
        description: "400 g Tomaten in den Mixbehaelter geben.",
        mode: { type: "none" as const }
      },
      {
        title: "Tomaten garen",
        description: "",
        mode: { type: "manualCooking" as const, temperature: 100, minutes: 12, seconds: 0, speed: 1, rotationDirection: "right" as const }
      }
    ]
  }
};

describe("Smart recipe payloads", () => {
  it("contains correct category ids in de-DE catalog", () => {
    const catalog = getCatalog("de-DE");
    expect(catalog.categories.saucesAndDips.id).toBe(220);
    expect(catalog.categories.vegan.id).toBe(579);
  });

  it("contains correct category ids in en-US catalog", () => {
    const catalog = getCatalog("en-US");
    expect(catalog.categories.mainDishes.id).toBe(260);
    expect(catalog.categories.vegetarian.id).toBe(588);
    expect(catalog.categories.mainDishes.label).toBe("Main Dishes");
  });

  it("builds locale-specific create-recipe URLs", () => {
    expect(createRecipeUrl("fr-FR")).toBe("https://www.monsieur-cuisine.com/fr/creer-une-recette?devices=mc-smart");
  });

  it("validates the model-facing input schema", () => {
    expect(validateRecipeInput(recipeInput).ok).toBe(true);
  });

  it("creates a Smart-only Monsieur Cuisine payload", () => {
    const payload = createSmartRecipePayload(recipeInput);
    expect(payload.deviceTypeIds).toEqual([13]);
    expect(payload.categoryIds).toEqual([220, 579]);
    expect((payload.servingSizes[0] as any).steps[1].mode.type).toBe("customized");
  });

  it("uses localized default ingredient group names", () => {
    const payload = createSmartRecipePayload({
      ...recipeInput,
      settings: {
        locale: "en-US",
        complexityId: 22
      },
      servingSize: {
        ...recipeInput.servingSize,
        ingredientGroups: [{ ingredients: [{ name: "Tomatoes", amount: 400, unit: "g", isOptional: false }] }]
      }
    });
    expect((payload.servingSizes[0] as any).ingredientGroups[0].name).toBe("Ingredients");
  });

  it("rejects reverse rotation above speed 3", () => {
    const result = validateRecipeInput({
      ...recipeInput,
      servingSize: {
        ...recipeInput.servingSize,
        steps: [
          {
            title: "Ruehren",
            description: "",
            mode: { type: "manualCooking", temperature: 0, minutes: 1, seconds: 0, speed: 5, rotationDirection: "left" }
          }
        ]
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("/servingSize/steps/0/mode/speed must be <= 3");
  });

  it("rejects fields that do not belong to the selected mode", () => {
    const result = validateRecipeInput({
      ...recipeInput,
      servingSize: {
        ...recipeInput.servingSize,
        steps: [
          {
            title: "Wiegen",
            description: "Tomaten einwiegen.",
            mode: { type: "scale", grams: 400, seconds: 5 }
          }
        ]
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("/servingSize/steps/0/mode must NOT have additional properties");
  });

  it("rounds nutrient amounts because the site requires integers", () => {
    const payload = createSmartRecipePayload({
      ...recipeInput,
      nutrients: [{ name: "fat", unit: "g", amount: 24.9 }]
    });
    expect(payload.nutrients[0].amount).toBe(25);
  });

  it("keeps the current Smart egg texture enum", () => {
    const payload = createSmartRecipePayload({
      ...recipeInput,
      servingSize: {
        ...recipeInput.servingSize,
        steps: [
          {
            title: "Eier kochen",
            description: "",
            mode: { type: "cookingEggs", size: "medium", texture: "waxy_soft" }
          }
        ]
      }
    });
    expect((payload.servingSizes[0] as any).steps[0].mode.modeSetting.texture).toBe("waxy_soft");
  });

  it("enforces type-safety on step descriptions for automatic cooking modes in TypeScript", () => {
    // These assignments compile successfully because descriptions are allowed on none, scale, and turbo modes.
    const validNoneStep: RecipeStepInput = {
      title: "Manual Step",
      description: "Do something manually",
      mode: { type: "none" }
    };
    const validScaleStep: RecipeStepInput = {
      title: "Weighing Step",
      description: "Weigh onions",
      mode: { type: "scale", grams: 100 }
    };
    const validTurboStep: RecipeStepInput = {
      title: "Turbo Step",
      description: "Pulse turbo",
      mode: { type: "turbo", seconds: 3 }
    };

    expect(validNoneStep.title).toBe("Manual Step");
    expect(validScaleStep.title).toBe("Weighing Step");
    expect(validTurboStep.title).toBe("Turbo Step");

    // Negative compiler assertions (checked by tsc compiler via @ts-expect-error):
    // @ts-expect-error - description must be empty or omitted for manualCooking step
    const invalidCookingStep: RecipeStepInput = {
      title: "Cooking Step",
      description: "Description not allowed here",
      mode: {
        type: "manualCooking" as const,
        temperature: 100 as const,
        minutes: 5,
        seconds: 0,
        speed: 1,
        rotationDirection: "right" as const
      }
    };

    // @ts-expect-error - description must be empty or omitted for cookingEggs step
    const invalidEggStep: RecipeStepInput = {
      title: "Egg Step",
      description: "Description not allowed here",
      mode: {
        type: "cookingEggs" as const,
        size: "medium" as const,
        texture: "soft" as const
      }
    };

    expect(invalidCookingStep.description).toBe("Description not allowed here");
    expect(invalidEggStep.description).toBe("Description not allowed here");
  });

  it("rejects recipe input at runtime if automatic cooking steps contain descriptions", () => {
    const invalidInput = {
      ...recipeInput,
      servingSize: {
        ...recipeInput.servingSize,
        steps: [
          {
            title: "Tomaten garen",
            description: "Some description that is forbidden",
            mode: { type: "manualCooking" as const, temperature: 100, minutes: 12, seconds: 0, speed: 1, rotationDirection: "right" as const }
          }
        ]
      }
    };
    const result = validateRecipeInput(invalidInput);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("/servingSize/steps/0 must match a schema in anyOf");
  });
});

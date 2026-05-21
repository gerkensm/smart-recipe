import { describe, expect, it } from "vitest";
import { getCatalog } from "../src/catalogs/index.js";
import { createRecipeUrl } from "../src/mc/urls.js";
import { createSmartRecipePayload } from "../src/recipes/payload.js";
import type { CreateSmartRecipePayloadOptions } from "../src/recipes/payload.js";
import { validateRecipeInput } from "../src/recipes/validation.js";

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
        title: "Tomaten garen",
        description: "400 g Tomaten in den Mixbehaelter geben und garen.",
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
    expect((payload.servingSizes[0] as any).steps[0].mode.type).toBe("customized");
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
            description: "Schonend ruehren.",
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
            description: "Eier in den Gareinsatz legen und automatisch kochen.",
            mode: { type: "cookingEggs", size: "medium", texture: "waxy_soft" }
          }
        ]
      }
    });
    expect((payload.servingSizes[0] as any).steps[0].mode.modeSetting.texture).toBe("waxy_soft");
  });
});

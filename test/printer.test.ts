import { describe, expect, it } from "vitest";
import { formatRecipeTerminal } from "../src/recipes/printer.js";
import type { RecipeInput } from "../src/recipes/schema.js";

// Helper to strip ANSI escape codes for testing the plain text structure
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("Recipe Terminal Pretty-Printer", () => {
  const baseRecipe: RecipeInput = {
    title: "Test Recipe",
    description: "A description of the test recipe.\nLine two of description.",
    settings: {
      locale: "de-DE" as const,
      complexityId: 99
    },
    status: "draft",
    categoryIds: [260],
    nutrients: [
      { name: "calories" as const, unit: "kCal", amount: 500 },
      { name: "carbohydrate" as const, unit: "g", amount: 50 }
    ],
    servingSize: {
      amount: 4,
      unit: "Portionen",
      instruction: "Serve warm.",
      preparationTime: 15,
      readyInTime: 45,
      ingredientGroups: [
        {
          name: "Main Ingredients",
          ingredients: [
            { name: "Flour", amount: 500, unit: "g", isOptional: false },
            { name: "Sugar", amount: 50, unit: "g", isOptional: true }
          ]
        }
      ],
      steps: [
        {
          title: "First Step",
          description: "Do something with the ingredients.",
          mode: {
            type: "manualCooking",
            temperature: 100,
            minutes: 5,
            seconds: 30,
            speed: 2,
            rotationDirection: "left"
          }
        }
      ]
    }
  };

  it("should format the title block and description with proper indentation", () => {
    const rawOutput = formatRecipeTerminal(baseRecipe);
    const output = stripAnsi(rawOutput);
    expect(output).toContain("┌───────────────┐");
    expect(output).toContain("│  Test Recipe  │");
    expect(output).toContain("└───────────────┘");
    expect(output).toContain("  A description of the test recipe.");
    expect(output).toContain("  Line two of description.");
  });

  it("should localize and indent the key metrics and nutrients for de-DE", () => {
    const rawOutput = formatRecipeTerminal(baseRecipe);
    const output = stripAnsi(rawOutput);
    expect(output).toContain("👥 4 Portionen");
    expect(output).toContain("🕒 Vorbereitung: 15 Min.");
    expect(output).toContain("🏁 Bereit in: 45 Min.");
    expect(output).toContain("🔥 500 kCal");
    expect(output).toContain("🍞 50g Kohlenhydrate");
  });

  it("should localize and indent the key metrics and nutrients for en-US", () => {
    const enRecipe: RecipeInput = {
      ...baseRecipe,
      settings: { locale: "en-US", complexityId: 16 },
      servingSize: {
        ...baseRecipe.servingSize,
        unit: "servings"
      }
    };
    const rawOutput = formatRecipeTerminal(enRecipe);
    const output = stripAnsi(rawOutput);
    expect(output).toContain("👥 4 servings");
    expect(output).toContain("🕒 Preparation: 15 m");
    expect(output).toContain("🏁 Ready in: 45 m");
    expect(output).toContain("🍞 50g Carbs");
  });

  it("should structure ingredients with proper indentation", () => {
    const rawOutput = formatRecipeTerminal(baseRecipe);
    const output = stripAnsi(rawOutput);
    // Since there's only 1 ingredient group, the group name is omitted and ingredients are indented by 4 spaces
    expect(output).toContain("    • 500 g Flour");
    expect(output).toContain("    • 50 g Sugar (optional)");
  });

  it("should structure multiple ingredient groups with group headers and nested indentation", () => {
    const multiGroupRecipe: RecipeInput = {
      ...baseRecipe,
      servingSize: {
        ...baseRecipe.servingSize,
        ingredientGroups: [
          {
            name: "Group One",
            ingredients: [{ name: "Ingredient A", amount: 100, unit: "g", isOptional: false }]
          },
          {
            name: "Group Two",
            ingredients: [{ name: "Ingredient B", amount: 200, unit: "ml", isOptional: false }]
          }
        ]
      }
    };
    const rawOutput = formatRecipeTerminal(multiGroupRecipe);
    const output = stripAnsi(rawOutput);
    expect(output).toContain("    🥣 Group One");
    expect(output).toContain("      • 100 g Ingredient A");
    expect(output).toContain("    🥣 Group Two");
    expect(output).toContain("      • 200 ml Ingredient B");
  });

  it("should localize manual cooking parameters and rotation purposes", () => {
    // German (de-DE) rotation left
    const deLeftOutput = stripAnsi(formatRecipeTerminal(baseRecipe));
    expect(deLeftOutput).toContain("    1. First Step");
    expect(deLeftOutput).toContain("      [Manuelles Kochen: 100°C, 5Min. 30Sek., Stufe 2, Rühren (Linkslauf)]");
    expect(deLeftOutput).toContain("      Do something with the ingredients.");

    // German (de-DE) rotation right
    const deRightRecipe: RecipeInput = {
      ...baseRecipe,
      servingSize: {
        ...baseRecipe.servingSize,
        steps: [
          {
            ...baseRecipe.servingSize.steps[0],
            mode: {
              type: "manualCooking",
              temperature: 100,
              minutes: 5,
              seconds: 30,
              speed: 2,
              rotationDirection: "right"
            }
          }
        ]
      }
    };
    const deRightOutput = stripAnsi(formatRecipeTerminal(deRightRecipe));
    expect(deRightOutput).toContain("      [Manuelles Kochen: 100°C, 5Min. 30Sek., Stufe 2, Zerkleinern (Rechtslauf)]");

    // English (en-US) rotation left
    const enLeftRecipe: RecipeInput = {
      ...baseRecipe,
      settings: { locale: "en-US", complexityId: 16 }
    };
    const enLeftOutput = stripAnsi(formatRecipeTerminal(enLeftRecipe));
    expect(enLeftOutput).toContain("      [Manual Cooking: 100°C, 5m 30s, Speed 2, Stir (Reverse)]");

    // English (en-US) rotation right
    const enRightRecipe: RecipeInput = {
      ...baseRecipe,
      settings: { locale: "en-US", complexityId: 16 },
      servingSize: {
        ...baseRecipe.servingSize,
        steps: [
          {
            ...baseRecipe.servingSize.steps[0],
            mode: {
              type: "manualCooking",
              temperature: 100,
              minutes: 5,
              seconds: 30,
              speed: 2,
              rotationDirection: "right"
            }
          }
        ]
      }
    };
    const enRightOutput = stripAnsi(formatRecipeTerminal(enRightRecipe));
    expect(enRightOutput).toContain("      [Manual Cooking: 100°C, 5m 30s, Speed 2, Chop (Forward)]");
  });

  it("should format other modes (scale, roast, turbo, sousVide, slowCooking, fermentation, cookingEggs, precleaning) correctly", () => {
    const modesRecipe: RecipeInput = {
      ...baseRecipe,
      servingSize: {
        ...baseRecipe.servingSize,
        steps: [
          {
            title: "Scale step",
            description: "Weigh sugar.",
            mode: { type: "scale", grams: 150 }
          },
          {
            title: "Roast step",
            description: "Roast onions.",
            mode: { type: "roast", temperature: 130, minutes: 8, seconds: 0 }
          },
          {
            title: "Turbo step",
            description: "Turbo pulse.",
            mode: { type: "turbo", seconds: 3 }
          },
          {
            title: "Eggs step",
            description: "Cook eggs.",
            mode: { type: "cookingEggs", size: "medium", texture: "waxy_soft" }
          },
          {
            title: "Clean step",
            description: "Run precleaning.",
            mode: { type: "precleaning", duration: "short" }
          }
        ]
      }
    };
    const output = stripAnsi(formatRecipeTerminal(modesRecipe));
    expect(output).toContain("      [Wiegen: 150 g]");
    expect(output).toContain("      [Anbraten: 130°C, 8Min.]");
    expect(output).toContain("      [Turbo: 3Sek.]");
    expect(output).toContain("      [Eierkochen: M, wachsweich]");
    expect(output).toContain("      [Vorspülen: kurz]");
  });
});

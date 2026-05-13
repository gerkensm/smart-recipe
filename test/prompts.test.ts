import { describe, expect, it } from "vitest";
import { accessoryHardwareRules, buildRecipeImagePrompt, buildRecipeInstructions } from "../src/llm/prompts.js";
import type { RecipeInput } from "../src/recipes/schema.js";
import type { RetrievedRecipePage } from "../src/retriever/types.js";

describe("LLM prompt guidance", () => {
  it("uses the requested locale instead of hardcoded prose", () => {
    const prompt = buildRecipeInstructions("de-DE");

    expect(prompt).toContain("set locale to de-DE");
    expect(prompt).toContain("German as used in Germany");
    expect(prompt).toContain("Category keys and German site IDs");
  });

  it("supports the English locale guidance", () => {
    const prompt = buildRecipeInstructions("en-US");

    expect(prompt).toContain("set locale to en-US");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Category keys and English site IDs");
  });

  it("includes accessory and hardware rules with de-DE device terms", () => {
    const rules = accessoryHardwareRules("de-DE");

    expect(rules).toContain("Messereinsatz");
    expect(rules).toContain("Linkslauf");
    expect(rules).toContain("Rühraufsatz einsetzen");
    expect(rules).toContain("Kocheinsatz einhängen");
    expect(rules).toContain("Dampfgaraufsatz aufsetzen");
    expect(rules).toContain("hotter than 60 C");
  });

  it("builds recipe image prompts from recipe and page context", () => {
    const prompt = buildRecipeImagePrompt(pageFixture, recipeFixture);

    expect(prompt).toContain("ambitious home cook");
    expect(prompt).toContain("not professional food photography");
    expect(prompt).toContain("Tomato Soup");
    expect(prompt).toContain("tomatoes");
    expect(prompt).toContain("Source recipe Markdown");
  });
});

const recipeFixture = {
  title: "Tomato Soup",
  description: "A bright soup with roasted tomatoes.",
  locale: "en-US",
  complexity: "easy",
  categoryKeys: [],
  nutrients: [
    { name: "calories", unit: "kCal", amount: 180 },
    { name: "carbohydrate", unit: "g", amount: 20 },
    { name: "fat", unit: "g", amount: 8 },
    { name: "protein", unit: "g", amount: 4 }
  ],
  servingSize: {
    amount: 4,
    unit: "servings",
    instruction: "",
    preparationTime: 10,
    readyInTime: 35,
    ingredientGroups: [
      {
        name: "Soup",
        ingredients: [
          { name: "tomatoes", amount: 800, unit: "g", isOptional: false }
        ]
      }
    ],
    steps: [
      {
        title: "Cook",
        description: "Cook and blend until smooth.",
        mode: { type: "none" }
      }
    ]
  }
} as RecipeInput;

const pageFixture: RetrievedRecipePage = {
  url: "https://example.test/soup",
  finalUrl: "https://example.test/soup",
  title: "Tomato Soup",
  markdown: "# Tomato Soup\n\nRoast tomatoes, then simmer and blend.",
  html: "",
  images: []
};

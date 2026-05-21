import { describe, expect, it } from "vitest";
import { accessoryHardwareRules, buildRecipeImagePrompt, buildRecipeInstructions } from "../src/llm/prompts.js";
import type { RecipeInput } from "../src/recipes/schema.js";
import type { RetrievedRecipePage } from "../src/retriever/types.js";

describe("LLM prompt guidance", () => {
  it("uses the requested locale instead of hardcoded prose", () => {
    const prompt = buildRecipeInstructions("de-DE");

    expect(prompt).toContain("set settings.locale to de-DE");
    expect(prompt).toContain("German as used in Germany");
    expect(prompt).toContain("Category IDs and German site IDs");
    expect(prompt).toContain("MULTI-LEVEL STEAMING OPTIMIZATION");
    expect(prompt).toContain("STEAMING PREHEAT CHOICE");
    expect(prompt).toContain("SCRAPE DOWN RULE");
    expect(prompt).toContain("GROSS VS. NET WEIGHT RULE");
    expect(prompt).toContain("bei der Abfrage zu Aufheizen 'Ja' wählen");
    expect(prompt).toContain("bei der Abfrage zu Aufheizen 'Nein' wählen");
    expect(prompt).toContain("mit dem Spatel nach unten schieben");
    expect(prompt).toContain("{ingredient} schälen/putzen (ergibt ca. {net} g)");
  });

  it("supports the English locale guidance", () => {
    const prompt = buildRecipeInstructions("en-US");

    expect(prompt).toContain("set settings.locale to en-US");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Category IDs and English site IDs");
    expect(prompt).toContain("select 'Yes' when asked to preheat");
    expect(prompt).toContain("select 'No' when asked to preheat");
    expect(prompt).toContain("scrape down the sides of the bowl using the spatula");
    expect(prompt).toContain("GROSS VS. NET WEIGHT RULE");
    expect(prompt).toContain("Peel/trim {ingredient} (yields approx. {net} g)");
  });

  it("includes accessory and hardware rules with de-DE device terms", () => {
    const rules = accessoryHardwareRules("de-DE");

    expect(rules).toContain("Messereinsatz");
    expect(rules).toContain("Linkslauf");
    expect(rules).toContain("Rühraufsatz einsetzen");
    expect(rules).toContain("Kocheinsatz");
    expect(rules).toContain("Dampfgaraufsatz aufsetzen");
    expect(rules).toContain("flacher Dampfgaraufsatz");
    expect(rules).toContain("den Kocheinsatz mithilfe des Spatels herausnehmen");
    expect(rules).toContain("den Kocheinsatz als Spritzschutz auf den Deckel setzen");
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
  settings: {
    locale: "en-US",
    complexityId: 22
  },
  categoryIds: [],
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

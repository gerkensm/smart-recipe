import { describe, expect, it } from "vitest";
import {
  cookidooCreatedRecipeToPage,
  cookidooOfficialRecipeToPage,
  detectRecipeSource,
  fetchRecipeSourceAsPage,
  monsieurCuisineRecipeToPage,
} from "../src/sources/index.js";
import { createCookidooPayload } from "../src/devices/tm/index.js";
import type { CookidooRecipeInput } from "../src/devices/tm/schema.js";

describe("recipe source ingestion", () => {
  it("detects web, Cookidoo, and Monsieur Cuisine sources", () => {
    expect(detectRecipeSource("https://example.com/recipe")).toEqual({
      type: "web",
      url: "https://example.com/recipe"
    });
    expect(detectRecipeSource("r34731")).toEqual({
      type: "cookidoo-official",
      id: "r34731"
    });
    expect(detectRecipeSource("01KSSGVJPJY3SQ8WXXQTKSFESF")).toEqual({
      type: "cookidoo-created",
      id: "01KSSGVJPJY3SQ8WXXQTKSFESF"
    });
    expect(detectRecipeSource("https://cookidoo.de/created-recipes/de-DE/01KSSGVJPJY3SQ8WXXQTKSFESF")).toEqual({
      type: "cookidoo-created",
      id: "01KSSGVJPJY3SQ8WXXQTKSFESF",
      public: false,
      locale: "de-DE",
      url: "https://cookidoo.de/created-recipes/de-DE/01KSSGVJPJY3SQ8WXXQTKSFESF"
    });
    expect(detectRecipeSource("https://www.monsieur-cuisine.com/connect-recipes?recipe-id=12345")).toEqual({
      type: "mc",
      id: "12345",
      url: "https://www.monsieur-cuisine.com/connect-recipes?recipe-id=12345"
    });
    expect(detectRecipeSource("https://www.monsieur-cuisine.com/de/create-recipe\\?devices\\=mc-smart\\&recipe-id\\=10408588")).toEqual({
      type: "mc",
      id: "10408588",
      url: "https://www.monsieur-cuisine.com/de/create-recipe?devices=mc-smart&recipe-id=10408588"
    });
    expect(detectRecipeSource("https://cookidoo.de/recipes/recipe/de-DE/r66613\\?foo\\=bar")).toEqual({
      type: "cookidoo-official",
      id: "r66613",
      locale: "de-DE",
      url: "https://cookidoo.de/recipes/recipe/de-DE/r66613?foo=bar"
    });
  });

  it("formats Cookidoo created recipes as LLM source pages", () => {
    const page = cookidooCreatedRecipeToPage({
      recipeId: "01K",
      recipeContent: {
        name: "Curry-Linsen-Suppe",
        prepTime: 600,
        totalTime: 2700,
        tools: ["TM6"],
        yield: { value: 2, unitText: "portion" },
        ingredients: [{ type: "INGREDIENT", text: "75 g rote Linsen" }],
        instructions: [
          {
            text: "Rote Linsen zugeben und 2 Min./140°C anbraten.",
            annotations: [{ type: "MODE", name: "browning", data: { time: 120 } }]
          }
        ],
        hints: "Mit Koriander servieren."
      }
    });

    expect(page.title).toBe("Curry-Linsen-Suppe");
    expect(page.markdown).toContain("Source: Cookidoo created recipe");
    expect(page.markdown).toContain("- 75 g rote Linsen");
    expect(page.markdown).toContain("Source mode: browning");
    expect(page.markdown).toContain("Mit Koriander servieren.");
  });

  it("normalizes and hydrates Cookidoo source images", async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = (async (url: string) => {
      if (url.includes("/created-recipes/")) {
        return new Response(JSON.stringify({
          recipeId: "01KSSGVJPJY3SQ8WXXQTKSFESF",
          recipeContent: {
            name: "Curry-Linsen-Suppe",
            image: "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/test.jpg",
            ingredients: [],
            instructions: []
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(url).toBe("https://assets.tmecosys.com/image/upload/img/recipe/test.jpg");
      return new Response(jpegBytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as any;

    const page = await fetchRecipeSourceAsPage(
      { type: "cookidoo-created", id: "01KSSGVJPJY3SQ8WXXQTKSFESF" },
      { cookies: { tm: "cookie" }, fetch: fetchImpl }
    );

    expect(page.images).toHaveLength(1);
    expect(page.images[0].bytes).toEqual(jpegBytes);
    expect(page.images[0].url).toBe("https://assets.tmecosys.com/image/upload/img/recipe/test.jpg");
  });

  it("formats Cookidoo official recipes as LLM source pages", () => {
    const page = cookidooOfficialRecipeToPage({
      id: "r1",
      title: "Marmorkuchen",
      thermomixVersions: ["TM6"],
      assets: {
        images: {
          square: "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/test-official"
        }
      },
      recipeIngredientGroups: [
        { recipeIngredients: [{ quantity: { value: 100 }, unitNotation: "g", ingredientNotation: "Mehl" }] }
      ],
      recipeStepGroups: [
        { recipeSteps: [{ formattedText: "Mehl in den Mixtopf geben und <nobr>10 Sek./Stufe 4</nobr> mischen." }] }
      ]
    });

    expect(page.markdown).toContain("Source: Cookidoo official recipe");
    expect(page.markdown).toContain("- 100 g Mehl");
    expect(page.markdown).toContain("10 Sek./Stufe 4");
    expect(page.images[0].url).toBe("https://assets.tmecosys.com/image/upload/img/recipe/test-official");
  });

  it("normalizes and hydrates Cookidoo official recipe images from assets", async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = (async (url: string) => {
      if (url.includes("/recipes/recipe/")) {
        return new Response(JSON.stringify({
          id: "r776048",
          title: "Baklava",
          assets: {
            images: {
              square: "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/baklava"
            }
          },
          recipeIngredientGroups: [],
          recipeStepGroups: []
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(url).toBe("https://assets.tmecosys.com/image/upload/img/recipe/baklava");
      return new Response(jpegBytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as any;

    const page = await fetchRecipeSourceAsPage(
      { type: "cookidoo-official", id: "r776048", locale: "de-DE" },
      { cookies: { tm: "cookie" }, fetch: fetchImpl }
    );

    expect(page.images).toHaveLength(1);
    expect(page.images[0].bytes).toEqual(jpegBytes);
    expect(page.images[0].url).toBe("https://assets.tmecosys.com/image/upload/img/recipe/baklava");
  });

  it("formats Monsieur Cuisine recipes as LLM source pages", () => {
    const page = monsieurCuisineRecipeToPage({
      title: "MC Suppe",
      servingSizes: [
        {
          amount: 2,
          unit: "Portionen",
          ingredientGroups: [{ ingredients: [{ amount: 100, unit: "g", name: "Linsen" }] }],
          steps: [{ title: "Kochen", description: "Linsen garen.", mode: { type: "manualCooking", deviceSettings: [{ time: 120 }] } }]
        }
      ]
    });

    expect(page.markdown).toContain("Source: Monsieur Cuisine recipe");
    expect(page.markdown).toContain("- 100 g Linsen");
    expect(page.markdown).toContain("Source mode: manualCooking");
  });

  it("creates Cookidoo payloads through the public TM subpath", () => {
    const input: CookidooRecipeInput = {
      title: "Test",
      prepTime: 1,
      totalTime: 2,
      servingSize: 2,
      servingUnitText: "portion",
      ingredients: [{ id: "a", text: "100 g Wasser" }],
      steps: [{ text: "Wasser zugeben." }],
      hints: "",
      settings: { locale: "de-DE" }
    };

    const payload = createCookidooPayload(input);
    expect(payload.meta.name).toBe("Test");
    expect(payload.instructions[0].text).toBe("Wasser zugeben.");
  });
});

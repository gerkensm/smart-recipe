import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { OpenAIRecipeImageGenerator } from "../src/llm/openai-image-generator.js";
import type { RecipeInput } from "../src/recipes/schema.js";
import type { RetrievedRecipePage } from "../src/retriever/types.js";

describe("OpenAIRecipeImageGenerator", () => {
  it("generates a new image from recipe context without source images by default", async () => {
    const calls: any[] = [];
    const client = {
      images: {
        async generate(params: any) {
          calls.push({ method: "generate", params });
          return { data: [{ b64_json: Buffer.from("generated-image").toString("base64") }] };
        },
        async edit(params: any) {
          calls.push({ method: "edit", params });
          return { data: [{ b64_json: Buffer.from("edited-image").toString("base64") }] };
        }
      }
    };

    const generator = new OpenAIRecipeImageGenerator({ client: client as any, model: "gpt-image-2" });
    const image = await generator.getImage(pageFixture, recipeFixture);

    expect(image.source).toBe("generated");
    expect(image.contentType).toBe("image/jpeg");
    expect(Buffer.from(image.bytes).toString()).toBe("generated-image");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("generate");
    expect(calls[0].params.model).toBe("gpt-image-2");
    expect(calls[0].params.prompt).toContain("ambitious home cook");
    expect(calls[0].params.prompt).toContain("Tomato Soup");
    expect(calls[0].params.prompt).toContain("tomatoes");
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
          { name: "tomatoes", amount: 800, unit: "g", isOptional: false },
          { name: "onion", amount: 1, unit: "piece", isOptional: false }
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

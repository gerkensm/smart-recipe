import { describe, expect, it } from "vitest";
import { findRecipeImageCandidates } from "../src/retriever/images.js";

describe("recipe image candidates", () => {
  it("prefers recipe metadata images over generic page images", () => {
    const images = findRecipeImageCandidates(
      `
      <html>
        <head>
          <meta property="og:image" content="/hero.jpg">
          <script type="application/ld+json">{"@type":"Recipe","image":"https://example.test/recipe.jpg"}</script>
        </head>
        <body><img src="/logo.png"><img class="recipe-main" src="/body.jpg" width="800"></body>
      </html>
      `,
      "https://example.test/recipe",
      2
    );
    expect(images[0].url).toBe("https://example.test/hero.jpg");
    expect(images.some((image) => image.url === "https://example.test/recipe.jpg")).toBe(true);
  });
});

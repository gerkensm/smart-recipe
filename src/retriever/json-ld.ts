import * as cheerio from "cheerio";

/**
 * Extracts JSON-LD objects from an HTML string.
 */
export function extractJsonLd(html: string): any[] {
  const $ = cheerio.load(html);
  const results: any[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).text().trim();
      if (!content) return;
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  return results;
}

/**
 * Specifically looks for Recipe objects in the JSON-LD tree.
 * Handles nested objects and @graph arrays.
 */
export function findRecipeObjects(jsonLd: any[]): any[] {
  const recipes = new Map<string, any>();

  const visit = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 10) return;

    if (obj["@type"] === "Recipe" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Recipe"))) {
      const id = obj["@id"] || JSON.stringify(obj.name) || JSON.stringify(obj.recipeIngredient);
      if (id && !recipes.has(id)) {
        recipes.set(id, obj);
      }
    }

    if (obj["@graph"] && Array.isArray(obj["@graph"])) {
      obj["@graph"].forEach((item: any) => visit(item, depth + 1));
    }

    // Some sites nest objects or use arrays of objects
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val)) {
        val.forEach((item: any) => visit(item, depth + 1));
      } else if (val && typeof val === "object") {
        visit(val, depth + 1);
      }
    }
  };

  jsonLd.forEach(item => visit(item));
  return Array.from(recipes.values());
}

/**
 * Formats a Recipe object into a simple markdown snippet for inclusion in the context.
 */
export function formatRecipeJsonLd(recipe: any): string {
  const lines: string[] = [];
  lines.push(`## Structured Data: ${recipe.name || "Recipe"}`);

  if (recipe.description) {
    lines.push(recipe.description);
  }

  if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
    lines.push("\n### Ingredients (Structured)");
    recipe.recipeIngredient.forEach((ing: string) => lines.push(`- ${ing}`));
  }

  if (recipe.recipeInstructions) {
    lines.push("\n### Instructions (Structured)");
    const instructions = Array.isArray(recipe.recipeInstructions) 
      ? recipe.recipeInstructions 
      : [recipe.recipeInstructions];
    
    instructions.forEach((step: any, i: number) => {
      if (typeof step === "string") {
        lines.push(`${i + 1}. ${step}`);
      } else if (step.text) {
        lines.push(`${i + 1}. ${step.text}`);
      } else if (step.itemListElement && Array.isArray(step.itemListElement)) {
        step.itemListElement.forEach((s: any, j: number) => {
          lines.push(`${i + 1}.${j + 1}. ${s.text || s}`);
        });
      }
    });
  }

  return lines.join("\n");
}

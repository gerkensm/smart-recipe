import * as cheerio from "cheerio";

type JsonLdPrimitive = string | number | boolean | null;
type JsonLdValue = JsonLdPrimitive | JsonLdValue[] | JsonLdObject;
export type JsonLdObject = { [key: string]: JsonLdValue | undefined };

function isJsonLdObject(value: unknown): value is JsonLdObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extracts JSON-LD objects from an HTML string.
 */
export function extractJsonLd(html: string): JsonLdObject[] {
  const $ = cheerio.load(html);
  const results: JsonLdObject[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).text().trim();
      if (!content) return;
      const parsed: unknown = JSON.parse(content);
      if (Array.isArray(parsed)) {
        results.push(...parsed.filter(isJsonLdObject));
      } else if (isJsonLdObject(parsed)) {
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
export function findRecipeObjects(jsonLd: JsonLdObject[]): JsonLdObject[] {
  const recipes = new Map<string, JsonLdObject>();

  const visit = (obj: JsonLdValue | undefined, depth = 0): void => {
    if (!isJsonLdObject(obj) || depth > 10) return;

    if (obj["@type"] === "Recipe" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Recipe"))) {
      const id = obj["@id"] || JSON.stringify(obj.name) || JSON.stringify(obj.recipeIngredient);
      if (typeof id === "string" && !recipes.has(id)) {
        recipes.set(id, obj);
      }
    }

    if (obj["@graph"] && Array.isArray(obj["@graph"])) {
      obj["@graph"].forEach((item) => visit(item, depth + 1));
    }

    // Some sites nest objects or use arrays of objects
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val)) {
        val.forEach((item) => visit(item, depth + 1));
      } else if (isJsonLdObject(val)) {
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
export function formatRecipeJsonLd(recipe: JsonLdObject): string {
  const lines: string[] = [];
  lines.push(`## Structured Data: ${typeof recipe.name === "string" ? recipe.name : "Recipe"}`);

  if (typeof recipe.description === "string") {
    lines.push(recipe.description);
  }

  if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
    lines.push("\n### Ingredients (Structured)");
    recipe.recipeIngredient.forEach((ing) => {
      if (typeof ing === "string") lines.push(`- ${ing}`);
    });
  }

  if (recipe.recipeInstructions) {
    lines.push("\n### Instructions (Structured)");
    const instructions = Array.isArray(recipe.recipeInstructions) 
      ? recipe.recipeInstructions 
      : [recipe.recipeInstructions];
    
    instructions.forEach((step, i: number) => {
      if (typeof step === "string") {
        lines.push(`${i + 1}. ${step}`);
      } else if (isJsonLdObject(step) && typeof step.text === "string") {
        lines.push(`${i + 1}. ${step.text}`);
      } else if (isJsonLdObject(step) && Array.isArray(step.itemListElement)) {
        step.itemListElement.forEach((s, j: number) => {
          const text = isJsonLdObject(s) && typeof s.text === "string" ? s.text : s;
          if (typeof text === "string") lines.push(`${i + 1}.${j + 1}. ${text}`);
        });
      }
    });
  }

  return lines.join("\n");
}

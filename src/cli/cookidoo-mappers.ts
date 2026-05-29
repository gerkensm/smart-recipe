import type { CookidooRecipeInput } from "../devices/tm/schema.js";

export function cleanHtmlText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&frac12;/g, "½")
    .replace(/&frac14;/g, "¼")
    .replace(/&frac34;/g, "¾")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseIsoDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  return hours * 60 + minutes + Math.round(seconds / 60);
}

export function mapOfficialCookidooToInput(recipe: any): CookidooRecipeInput {
  const ingredients = normalizeOfficialIngredients(recipe);
  const steps = normalizeOfficialSteps(recipe);
  const servingSizeValue = recipe.servingSize?.quantity?.value
    ?? recipe.servingSize?.value
    ?? recipe.yield?.value
    ?? recipe.recipeYield;
  const servingUnitText = recipe.servingSize?.unitNotation
    ?? recipe.servingSize?.unitText
    ?? recipe.yield?.unitText
    ?? (typeof recipe.recipeYield === "string" ? recipe.recipeYield.replace(/^\d+\s*/, "") : undefined)
    ?? "Stück";

  const parsedIngredients = ingredients.map((ingText: string, idx: number) => ({
    id: `ing-${idx}`,
    text: cleanHtmlText(ingText)
  }));

  const parsedSteps = steps.map((stepObj: any) => {
    const stepText = cleanHtmlText(typeof stepObj === "string" ? stepObj : stepObj.formattedText || stepObj.text || "");
    const ingredientAnnotations: any[] = [];
    const modeAnnotations: any[] = [];
    const intervals: [number, number][] = [];

    const hasOverlap = (start: number, end: number) => {
      for (const [s, e] of intervals) {
        if (start < e && end > s) return true;
      }
      return false;
    };

    const modePatterns = [
      {
        pattern: /\b(\d+)\s*(?:Sek\.|Min\.)\/(?:\d+°C\/|Varoma\/)?(?:Linkslauf\/|Rechtslauf\/)?Stufe\s*(\d+(?:\.\d+)?)/gi,
        parser: (match: string, p1: string, p2: string) => {
          const isVaroma = match.toLowerCase().includes("varoma");
          const durationSec = match.toLowerCase().includes("min") ? parseInt(p1, 10) * 60 : parseInt(p1, 10);
          if (isVaroma) {
            return { type: "steaming" as const, time: durationSec, speed: p2 as any };
          }
          const speedNum = parseFloat(p2);
          if (speedNum >= 6) {
            return { type: "blend" as const, time: durationSec, speed: p2 as any };
          }
          return { type: "cook" as const, time: durationSec, temperature: 100, speed: p2 as any };
        }
      },
      {
        pattern: /Teig\s*[\uE000-\uE002]\/(\d+)\s*(?:Sek\.|Min\.)/gi,
        parser: (match: string, p1: string) => {
          const durationSec = match.toLowerCase().includes("min") ? parseInt(p1, 10) * 60 : parseInt(p1, 10);
          return { type: "dough" as const, time: durationSec };
        }
      }
    ];

    modePatterns.forEach(({ pattern, parser }) => {
      const matches = Array.from(stepText.matchAll(pattern));
      for (const match of matches) {
        if (match.index === undefined) continue;
        const start = match.index;
        const end = start + match[0].length;
        if (!hasOverlap(start, end)) {
          const mappedMode = parser(match[0], match[1], match[2] || "");
          if (mappedMode) {
            modeAnnotations.push({
              matchedSubstring: match[0],
              mode: mappedMode
            });
            intervals.push([start, end]);
          }
        }
      }
    });

    const candidateIngredients: { word: string; ingId: string }[] = [];
    parsedIngredients.forEach((ing: { id: string; text: string }) => {
      const cleanIng = ing.text
        .replace(/^\d+(?:\s*[\d/½¼¾+&;-]+)*\s*(?:g|kg|ml|TL|EL|Prise|Prisen|Würfel|Stück|portions?|g\.?|kg\.?|ml\.?)\s+/i, "")
        .trim();

      const words = cleanIng.split(/[\s,.-]+/);
      words.forEach((word: string) => {
        const trimmed = word.trim();
        if (trimmed.length > 3) {
          candidateIngredients.push({ word: trimmed, ingId: ing.id });
        }
      });
    });

    candidateIngredients.sort((a, b) => b.word.length - a.word.length);

    candidateIngredients.forEach(({ word, ingId }) => {
      const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`\\b(${escaped}\\w*)\\b`, "gi");
      const matches = Array.from(stepText.matchAll(regex));
      for (const match of matches) {
        if (match.index === undefined) continue;
        const start = match.index;
        const end = start + match[0].length;
        if (!hasOverlap(start, end)) {
          ingredientAnnotations.push({
            matchedSubstring: match[1],
            ingredientId: ingId
          });
          intervals.push([start, end]);
        }
      }
    });

    return {
      text: stepText,
      ingredientAnnotations,
      modeAnnotations
    };
  });

  return {
    title: recipe.name || "Cookidoo Recipe",
    prepTime: recipe.prepTime ? parseIsoDuration(recipe.prepTime) : 0,
    totalTime: recipe.totalTime ? parseIsoDuration(recipe.totalTime) : 0,
    servingSize: typeof servingSizeValue === "number" ? servingSizeValue : parseInt(String(servingSizeValue ?? ""), 10) || 1,
    servingUnitText,
    ingredients: parsedIngredients,
    steps: parsedSteps,
    hints: "",
    settings: { locale: "de-DE" }
  };
}

function normalizeOfficialIngredients(recipe: any): string[] {
  if (Array.isArray(recipe.recipeIngredient)) {
    return recipe.recipeIngredient;
  }
  if (Array.isArray(recipe.recipeIngredientGroups)) {
    return recipe.recipeIngredientGroups.flatMap((group: any) =>
      (group.recipeIngredients ?? []).map((ingredient: any) =>
        [ingredient.quantity?.value, ingredient.unitNotation, ingredient.ingredientNotation, ingredient.preparation]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+,/g, ",")
      )
    );
  }
  return [];
}

function normalizeOfficialSteps(recipe: any): any[] {
  if (Array.isArray(recipe.recipeInstructions)) {
    return recipe.recipeInstructions;
  }
  if (Array.isArray(recipe.recipeStepGroups)) {
    return recipe.recipeStepGroups.flatMap((group: any) => group.recipeSteps ?? []);
  }
  return [];
}

export function mapCustomCookidooToInput(recipe: any): CookidooRecipeInput {
  const content = recipe.recipeContent || {};
  const ingredients = (content.ingredients || []).map((ing: any, idx: number) => ({
    id: `ing-${idx}`,
    text: ing.text
  }));

  return {
    title: content.name || "Custom Recipe",
    prepTime: Math.round((content.prepTime || 0) / 60),
    totalTime: Math.round((content.totalTime || 0) / 60),
    servingSize: content.yield?.value || 1,
    servingUnitText: content.yield?.unitText || "Portionen",
    ingredients,
    steps: (content.instructions || []).map((step: any) => {
      const stepText = step.text || "";
      const ingredientAnnotations: any[] = [];
      const modeAnnotations: any[] = [];

      if (Array.isArray(step.annotations)) {
        step.annotations.forEach((ann: any) => {
          const matchedSubstring = stepText.slice(ann.position.offset, ann.position.offset + ann.position.length);
          if (ann.type === "INGREDIENT") {
            const ingText = typeof ann.data.description === "string"
              ? ann.data.description
              : ann.data.description?.text || "";
            const ingIdx = (content.ingredients || []).findIndex((ing: any) => ing.text.toLowerCase().includes(ingText.toLowerCase()));
            const ingredientId = ingIdx !== -1 ? `ing-${ingIdx}` : `ing-0`;
            ingredientAnnotations.push({
              matchedSubstring,
              ingredientId
            });
          } else if (ann.type === "MODE") {
            const modeName = ann.name;
            const modeData = ann.data || {};
            let mappedMode: any = null;
            if (modeName === "dough") {
              mappedMode = { type: "dough", time: modeData.time || 60 };
            } else if (modeName === "blend") {
              mappedMode = { type: "blend", time: modeData.time || 30, speed: modeData.speed || "7" };
            } else if (modeName === "turbo") {
              mappedMode = { type: "turbo", pulseDuration: modeData.time || modeData.pulseDuration || 2, pulseCount: modeData.pulseCount };
            } else if (modeName === "warm_up" || modeName === "warmUp") {
              mappedMode = { type: "warmUp", temperature: Number(modeData.temperature?.value ?? 37), speed: modeData.speed || "1" };
            } else if (modeName === "cook") {
              mappedMode = { type: "cook", time: modeData.time || 60, temperature: Number(modeData.temperature?.value ?? 100), speed: modeData.speed || "1" };
            } else if (modeName === "rice_cooker" || modeName === "riceCooker") {
              mappedMode = { type: "riceCooker" };
            } else if (modeName === "steaming") {
              mappedMode = { type: "steaming", time: modeData.time || 60, speed: modeData.speed || "1", accessory: modeData.accessory || "Varoma" };
            } else if (modeName === "browning") {
              mappedMode = { type: "browning", time: modeData.time || 60, temperature: Number(modeData.temperature?.value ?? 140) };
            }
            if (mappedMode) {
              modeAnnotations.push({
                matchedSubstring,
                mode: mappedMode
              });
            }
          }
        });
      }
      return {
        text: stepText,
        ingredientAnnotations,
        modeAnnotations
      };
    }),
    hints: formatCookidooHints(content.hints),
    settings: { locale: "de-DE" }
  };
}

function formatCookidooHints(hints: unknown): string {
  if (typeof hints === "string") return hints;
  if (!Array.isArray(hints)) return "";
  return hints
    .map((hint) => {
      if (typeof hint === "string") return hint;
      if (hint && typeof hint === "object") {
        const content = (hint as any).content ?? (hint as any).text;
        return typeof content === "string" ? cleanHtmlText(content) : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

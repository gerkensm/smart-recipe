import type { RecipeInput } from "./schema.js";
import type { PromptModeInput } from "./types.js";

export function normalizeRecipeInput(input: RecipeInput): RecipeInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description ?? "",
    status: input.status ?? "draft",
    categoryKeys: [...new Set(input.categoryKeys ?? [])] as RecipeInput["categoryKeys"],
    servingSize: {
      ...input.servingSize,
      instruction: input.servingSize.instruction ?? "",
      ingredientGroups: input.servingSize.ingredientGroups.map((group) => ({
        ...group,
        name: group.name ?? "",
        ingredients: group.ingredients.map((ingredient) => ({
          ...ingredient,
          isOptional: ingredient.isOptional ?? false
        }))
      })),
      steps: input.servingSize.steps.map((step) => ({
        ...step,
        title: step.title.slice(0, 80),
        description: step.description.slice(0, 240),
        mode: normalizePromptMode(step.mode)
      }))
    }
  } as RecipeInput;
}

export function normalizePromptMode(mode: PromptModeInput): PromptModeInput {
  switch (mode.type) {
    case "none":
      return { type: "none" };
    case "manualCooking":
      return pick(mode, ["type", "temperature", "minutes", "seconds", "speed", "rotationDirection"]);
    case "turbo":
      return pick(mode, ["type", "seconds"]);
    case "scale":
      return pick(mode, ["type", "grams"]);
    case "roast":
      return pick(mode, ["type", "temperature", "minutes", "seconds"]);
    case "solidDoughKnead":
    case "softDoughKnead":
    case "liquidDoughKnead":
    case "steam":
    case "riceCooking":
    case "foodProcessor":
    case "puree":
    case "smoothie":
      return pick(mode, ["type", "minutes", "seconds"]);
    case "sousVide":
    case "slowCooking":
    case "fermentation":
      return pick(mode, ["type", "temperature", "minutes", "seconds"]);
    case "cookingEggs":
      return pick(mode, ["type", "size", "texture"]);
    case "precleaning":
      return pick(mode, ["type", "duration"]);
  }
}

function pick(value: PromptModeInput, keys: readonly (keyof PromptModeInput)[]): PromptModeInput {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result as unknown as PromptModeInput;
}

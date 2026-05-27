import type { RecipeInput } from "./schema.js";
import type { RecipeStepInput } from "./types.js";

export function normalizeRecipeInput(input: RecipeInput): RecipeInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description ?? "",
    status: input.status ?? "draft",
    categoryIds: [
      ...new Set(input.categoryIds ?? []),
    ] as RecipeInput["categoryIds"],
    servingSize: {
      ...input.servingSize,
      instruction: input.servingSize.instruction ?? "",
      ingredientGroups: input.servingSize.ingredientGroups.map((group) => ({
        ...group,
        name: group.name ?? "",
        ingredients: group.ingredients.map((ingredient) => ({
          ...ingredient,
          isOptional: ingredient.isOptional ?? false,
        })),
      })),
      steps: input.servingSize.steps.map((step) => {
        const allowedWithDesc = ["none", "scale", "turbo"];
        const description = allowedWithDesc.includes(step.mode.type)
          ? (step.description ?? "").slice(0, 240)
          : "";
        return {
          ...step,
          title: step.title.slice(0, 80),
          description,
        } as RecipeStepInput;
      }),
    },
  } as RecipeInput;
}

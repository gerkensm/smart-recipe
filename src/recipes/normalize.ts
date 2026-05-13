import type { RecipeInput } from "./schema.js";

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
        description: step.description.slice(0, 240)
      }))
    }
  } as RecipeInput;
}

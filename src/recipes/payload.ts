import { getCatalog, resolveCategoryIds, resolveComplexityId } from "../catalogs/catalogs.js";
import { MONSIEUR_CUISINE_SMART_DEVICE_TYPE_ID } from "./constants.js";
import { promptModeToRawMode } from "./modes.js";
import type { SmartRecipeInput, SmartRecipePayload } from "./types.js";
import { assertSmartRecipePayload } from "./validation.js";

export interface CreateSmartRecipePayloadOptions extends SmartRecipeInput {
  thumbnailMediaId?: number | null;
  detailsImageMediaId?: number | null;
}

export function createSmartRecipePayload(options: CreateSmartRecipePayloadOptions): SmartRecipePayload {
  const locale = options.locale ?? "de-DE";
  const catalog = getCatalog(locale);
  const payload: SmartRecipePayload = {
    status: options.status ?? "draft",
    source: "member",
    languageLocale: locale,
    deviceTypeIds: [MONSIEUR_CUISINE_SMART_DEVICE_TYPE_ID],
    title: options.title,
    description: options.description ?? "",
    thumbnail: {
      portraitMediaId: options.thumbnailMediaId ?? null,
      landscapeMediaId: options.thumbnailMediaId ?? null
    },
    detailsImage: {
      portraitMediaId: options.detailsImageMediaId ?? null,
      landscapeMediaId: options.detailsImageMediaId ?? null
    },
    complexityId: resolveComplexityId(options.complexity ?? "easy", locale),
    allowSocialSharing: false,
    categoryIds: resolveCategoryIds(options.categoryKeys ?? [], locale),
    nutrients: (options.nutrients ?? []).map((nutrient) => ({
      name: nutrient.name,
      unit: nutrient.unit,
      amount: Math.round(Number(nutrient.amount))
    })),
    servingSizes: [
      {
        amount: options.servingSize.amount,
        maxServing: null,
        instruction: options.servingSize.instruction ?? "",
        unit: options.servingSize.unit,
        isDefault: true,
        preparationTime: options.servingSize.preparationTime,
        readyInTime: options.servingSize.readyInTime,
        ingredientGroups: options.servingSize.ingredientGroups.map((group, groupIndex) => ({
          name: group.name ?? (groupIndex === 0 ? catalog.defaultIngredientGroupName : ""),
          isDefault: groupIndex === 0,
          order: groupIndex,
          ingredients: group.ingredients.map((ingredient, ingredientIndex) => ({
            name: ingredient.name,
            isOptional: ingredient.isOptional ?? false,
            unit: ingredient.unit,
            amount: String(ingredient.amount),
            systemIngredientId: null,
            order: ingredientIndex + 1,
            ingredientCategory: null,
            iconUrl: null
          }))
        })),
        steps: options.servingSize.steps.map((step, index) => ({
          title: truncate(step.title, 80),
          description: truncate(step.description, 240),
          duration: null,
          mode: promptModeToRawMode(step.mode),
          videoMedia: null,
          order: index
        })),
        order: 0
      }
    ]
  };

  assertSmartRecipePayload(payload);
  return payload;
}

function truncate(value: string, max: number): string {
  return String(value ?? "").slice(0, max);
}

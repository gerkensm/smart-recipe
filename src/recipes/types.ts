import type { CategoryKey, Complexity, SupportedLocale } from "../catalogs/types.js";

export interface Nutrient {
  name: "calories" | "carbohydrate" | "fat" | "protein";
  unit: string;
  amount: number;
}

export interface RecipeIngredientInput {
  name: string;
  amount: string | number;
  unit: string;
  isOptional?: boolean;
}

export interface RecipeIngredientGroupInput {
  name?: string;
  ingredients: RecipeIngredientInput[];
}

export type PromptModeType =
  | "none"
  | "manualCooking"
  | "turbo"
  | "scale"
  | "roast"
  | "solidDoughKnead"
  | "softDoughKnead"
  | "liquidDoughKnead"
  | "steam"
  | "sousVide"
  | "slowCooking"
  | "cookingEggs"
  | "precleaning"
  | "fermentation"
  | "riceCooking"
  | "foodProcessor"
  | "puree"
  | "smoothie";

export interface PromptModeInput {
  type: PromptModeType;
  temperature?: number;
  minutes?: number;
  seconds?: number;
  speed?: number;
  rotationDirection?: "left" | "right";
  grams?: number;
  size?: "small" | "medium" | "large";
  texture?: "soft" | "waxy_soft" | "hard";
  duration?: "short" | "long";
}

export interface RecipeStepInput {
  title: string;
  description: string;
  mode: PromptModeInput;
}

export interface RecipeServingSizeInput {
  amount: number;
  unit: string;
  instruction?: string;
  preparationTime: number;
  readyInTime: number;
  ingredientGroups: RecipeIngredientGroupInput[];
  steps: RecipeStepInput[];
}

export interface SmartRecipeInput {
  title: string;
  description?: string;
  locale?: SupportedLocale;
  status?: "draft" | "private-publish";
  complexity?: Complexity;
  categoryKeys?: CategoryKey[];
  nutrients?: Nutrient[];
  servingSize: RecipeServingSizeInput;
}

export interface SmartRecipePayload {
  status: "draft" | "private-publish";
  source: "member";
  languageLocale: SupportedLocale;
  deviceTypeIds: [13];
  title: string;
  description: string;
  thumbnail: { portraitMediaId: number | null; landscapeMediaId: number | null };
  detailsImage: { portraitMediaId: number | null; landscapeMediaId: number | null };
  complexityId: number;
  allowSocialSharing: false;
  categoryIds: number[];
  nutrients: Nutrient[];
  servingSizes: unknown[];
}

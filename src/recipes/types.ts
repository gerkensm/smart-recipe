import type { SupportedLocale } from "../catalogs/types.js";
import type { RecipeInput } from "./schema.js";

export type { SmartRecipePayload } from "./schema.js";

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

export type PromptModeInput = RecipeInput["servingSize"]["steps"][number]["mode"];
export type PromptModeType = PromptModeInput["type"];

export type RecipeStepInput = RecipeInput["servingSize"]["steps"][number];

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
  settings: {
    locale: SupportedLocale;
    complexityId: number;
  };
  status?: "draft" | "private-publish";
  categoryIds?: number[];
  nutrients?: Nutrient[];
  servingSize: RecipeServingSizeInput;
}

import type { Ingredient, Step, MetaPatch } from "./payload.js";

export interface CookidooProfile {
  id?: string;
  isPublic?: boolean;
  userInfo?: {
    username?: string;
    description?: string;
    picture?: string;
    pictureTemplate?: string;
  };
  savedSearches?: Array<{
    id: string;
    search?: {
      countries?: string[];
      languages?: string[];
      accessories?: string[];
      [key: string]: unknown;
    };
  }>;
  foodPreferences?: unknown[];
  meta?: Record<string, unknown>;
  thermomixes?: unknown[];
  [key: string]: unknown;
}

export interface CookidooRecipeSummary {
  id: string;
  title: string;
  status?: string;
  workStatus?: string;
  updatedAt?: string;
  createdAt?: string;
  tools?: string[];
  ingredientCount?: number;
  stepCount?: number;
  hasImage?: boolean;
  hasHints?: boolean;
  recipeUrl?: string;
}

export interface CookidooCreatedRecipeContent {
  name?: string;
  image?: string;
  descriptiveAssets?: unknown[];
  ingredients?: Ingredient[];
  instructions?: Step[];
  tools?: string[];
  tool?: string[];
  yield?: {
    value?: number;
    unitText?: string;
  };
  prepTime?: number;
  totalTime?: number;
  hints?: string | string[] | Array<{ content?: string; text?: string }>;
  [key: string]: unknown;
}

export interface CookidooCreatedRecipe {
  recipeId: string;
  authorId?: string;
  parentRecipeId?: string;
  status?: string;
  workStatus?: string;
  createdAt?: string;
  modifiedAt?: string;
  recipeContent?: CookidooCreatedRecipeContent;
  [key: string]: unknown;
}

export interface CookidooRecipeListResult {
  total: number;
  totalPage: number;
  recipes: CookidooRecipeSummary[];
  raw?: unknown;
}

export interface CookidooImageUploadResult {
  public_id: string;
  format: string;
}

export interface CookidooRecipeCreateResult {
  recipe: CookidooCreatedRecipe;
  recipeUrl: string;
}

export interface CookidooPayloadPatch {
  meta: MetaPatch;
  instructions: Step[];
}

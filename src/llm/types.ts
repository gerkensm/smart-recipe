import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { SupportedLocale } from "../catalogs/types.js";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface RecipeGenerationOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  locale?: SupportedLocale;
  maxCorrectionAttempts?: number;
}

export interface RecipeGenerator {
  generate(page: RetrievedRecipePage, options?: RecipeGenerationOptions): Promise<RecipeInput>;
}

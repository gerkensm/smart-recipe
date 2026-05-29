import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { SupportedLocale } from "../catalogs/types.js";
import type { PromptModeType } from "../recipes/types.js";
import type { DeviceAdapter } from "../devices/adapter.js";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface RecipeGenerationOptions {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  locale?: SupportedLocale;
  maxCorrectionAttempts?: number;
  /** Mode types to exclude from generation. Use for modes that require optional accessories not owned by the user (e.g. "foodProcessor"). */
  excludeModes?: PromptModeType[];
  adapter?: DeviceAdapter;
}


export interface RecipeGenerator {
  generate(page: RetrievedRecipePage, options?: RecipeGenerationOptions): Promise<RecipeInput>;
}

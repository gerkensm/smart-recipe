import type { RetrievedRecipePage } from "../retriever/types.js";

export type RecipeSource =
  | { type: "web"; url: string }
  | { type: "mc"; id: string; url?: string }
  | { type: "cookidoo-official"; id: string; locale?: string; url?: string }
  | { type: "cookidoo-created"; id: string; public?: boolean; locale?: string; url?: string };

export interface SourceCookies {
  mc?: string;
  tm?: string;
}

export interface FetchRecipeSourceOptions {
  cookies?: SourceCookies;
  locale?: string;
  fetch?: typeof fetch;
  includeImageBytes?: boolean;
}

export interface RecipeSourceFetcher<TSource extends RecipeSource = RecipeSource, TRaw = unknown> {
  canFetch(source: RecipeSource): source is TSource;
  fetch(source: TSource, options: FetchRecipeSourceOptions): Promise<TRaw>;
  toRetrievedPage(raw: TRaw, source: TSource): RetrievedRecipePage;
}

import { CookidooApi } from "../devices/tm/api.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
import { hydrateImages } from "../retriever/images.js";
import { RecipePageRetriever } from "../retriever/retriever.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import {
  cookidooCreatedRecipeToPage,
  cookidooOfficialRecipeToPage,
  monsieurCuisineRecipeToPage,
} from "./format-page.js";
import type { FetchRecipeSourceOptions, RecipeSource, RecipeSourceFetcher } from "./types.js";

export class WebRecipeSourceFetcher implements RecipeSourceFetcher<Extract<RecipeSource, { type: "web" }>, RetrievedRecipePage> {
  canFetch(source: RecipeSource): source is Extract<RecipeSource, { type: "web" }> {
    return source.type === "web";
  }

  fetch(source: Extract<RecipeSource, { type: "web" }>, options: FetchRecipeSourceOptions = {}): Promise<RetrievedRecipePage> {
    return new RecipePageRetriever({
      fetch: options.fetch,
      includeImageBytes: options.includeImageBytes,
    }).retrieve(source.url);
  }

  toRetrievedPage(raw: RetrievedRecipePage): RetrievedRecipePage {
    return raw;
  }
}

export class CookidooRecipeSourceFetcher implements RecipeSourceFetcher<Extract<RecipeSource, { type: "cookidoo-official" | "cookidoo-created" }>, unknown> {
  canFetch(source: RecipeSource): source is Extract<RecipeSource, { type: "cookidoo-official" | "cookidoo-created" }> {
    return source.type === "cookidoo-official" || source.type === "cookidoo-created";
  }

  async fetch(source: Extract<RecipeSource, { type: "cookidoo-official" | "cookidoo-created" }>, options: FetchRecipeSourceOptions = {}): Promise<unknown> {
    const cookie = options.cookies?.tm;
    if (!cookie) throw new Error("Cookidoo source ingestion requires a Thermomix/Cookidoo cookie.");
    const api = new CookidooApi({
      cookie,
      locale: source.locale ?? options.locale ?? "de-DE",
      fetch: options.fetch,
    });
    if (source.type === "cookidoo-official") {
      return api.getOfficialRecipe(source.id);
    }
    return source.public ? api.getPublicCreatedRecipe(source.id) : api.getCreatedRecipe(source.id);
  }

  toRetrievedPage(raw: unknown, source: Extract<RecipeSource, { type: "cookidoo-official" | "cookidoo-created" }>): RetrievedRecipePage {
    return source.type === "cookidoo-official"
      ? cookidooOfficialRecipeToPage(raw, source.url)
      : cookidooCreatedRecipeToPage(raw, source.url);
  }
}

export class MonsieurCuisineRecipeSourceFetcher implements RecipeSourceFetcher<Extract<RecipeSource, { type: "mc" }>, unknown> {
  canFetch(source: RecipeSource): source is Extract<RecipeSource, { type: "mc" }> {
    return source.type === "mc";
  }

  async fetch(source: Extract<RecipeSource, { type: "mc" }>, options: FetchRecipeSourceOptions = {}): Promise<unknown> {
    const cookie = options.cookies?.mc;
    if (!cookie) throw new Error("Monsieur Cuisine source ingestion requires an MC cookie.");
    const client = new MonsieurCuisineSmartClient({
      cookie,
      locale: options.locale as any,
      fetch: options.fetch,
    });
    return client.getRecipe(source.id);
  }

  toRetrievedPage(raw: unknown, source: Extract<RecipeSource, { type: "mc" }>): RetrievedRecipePage {
    return monsieurCuisineRecipeToPage(raw, source.url);
  }
}

const DEFAULT_FETCHERS = [
  new WebRecipeSourceFetcher(),
  new CookidooRecipeSourceFetcher(),
  new MonsieurCuisineRecipeSourceFetcher(),
];

export async function fetchRecipeSourceAsPage(
  source: RecipeSource,
  options: FetchRecipeSourceOptions = {},
  fetchers: RecipeSourceFetcher[] = DEFAULT_FETCHERS
): Promise<RetrievedRecipePage> {
  return (await fetchRecipeSourceWithRaw(source, options, fetchers)).page;
}

export async function fetchRecipeSourceWithRaw(
  source: RecipeSource,
  options: FetchRecipeSourceOptions = {},
  fetchers: RecipeSourceFetcher[] = DEFAULT_FETCHERS
): Promise<{ raw: unknown; page: RetrievedRecipePage }> {
  const fetcher = fetchers.find((candidate) => candidate.canFetch(source));
  if (!fetcher) throw new Error(`No recipe source fetcher for source type: ${source.type}`);
  const raw = await (fetcher as any).fetch(source, options);
  let page = (fetcher as any).toRetrievedPage(raw, source) as RetrievedRecipePage;
  if (source.type !== "web" && options.includeImageBytes !== false && page.images.length > 0) {
    page = {
      ...page,
      images: await hydrateImages(page.images, { fetchImpl: options.fetch }),
    };
  }
  return { raw, page };
}

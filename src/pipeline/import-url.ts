import { Buffer } from "node:buffer";
import { createLogger, type SmartRecipeLogger } from "../logging/logger.js";
import { OpenAIRecipeGenerator } from "../llm/openai-generator.js";
import type { AuthProvider } from "../mc/auth.js";
import { RecipePageRetriever } from "../retriever/retriever.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import { detectRecipeSource } from "../sources/detect.js";
import { fetchRecipeSourceAsPage } from "../sources/fetchers.js";
import type { RecipeSource } from "../sources/types.js";
import type { ReasoningEffort } from "../llm/types.js";
import type { SupportedLocale } from "../catalogs/types.js";
import type { PromptModeType } from "../recipes/types.js";
import type { RecipeImageProvider } from "./images.js";
import type { DeviceAdapter } from "../devices/adapter.js";
import { MonsieurCuisineAdapter } from "../devices/mc/adapter.js";

export interface ImportRecipeFromUrlOptions {
  url: string;
  source?: RecipeSource;
  sourceType?: "web" | "mc" | "cookidoo" | "tm";
  sourceCookies?: {
    mc?: string;
    tm?: string;
  };
  dryRun?: boolean;
  fullResponse?: boolean;
  locale?: SupportedLocale;
  openAIModel?: string;
  reasoningEffort?: ReasoningEffort;
  /** Mode types to exclude from generation (e.g. ["foodProcessor"] if the user doesn't own the accessory). */
  excludeModes?: PromptModeType[];
  cookie?: string;
  authProvider?: AuthProvider;
  imageProvider?: RecipeImageProvider;
  logger?: SmartRecipeLogger;
  adapter?: DeviceAdapter;
}

export interface ImportRecipeFromUrlResult {
  page: RetrievedRecipePage;
  recipeInput: any;
  payload: any;
  uploadedImage?: any;
  recipeImage?: any;
  draft?: unknown;
  recipeUrl?: string;
}

export interface ImportRecipeOptions extends Omit<ImportRecipeFromUrlOptions, "url"> {
  page: RetrievedRecipePage;
}

// ─── Generation-only options ──────────────────────────────────────────────────

export interface GenerateSmartRecipeOptions {
  page: RetrievedRecipePage;
  locale?: SupportedLocale;
  openAIModel?: string;
  reasoningEffort?: ReasoningEffort;
  excludeModes?: PromptModeType[];
  logger?: SmartRecipeLogger;
  adapter?: DeviceAdapter;
}

export interface GenerateSmartRecipeResult {
  page: RetrievedRecipePage;
  recipeInput: any;
  payload: any;
}

// ─── Upload-only options ──────────────────────────────────────────────────────

export interface UploadSmartRecipeOptions {
  page: RetrievedRecipePage;
  recipeInput: any;
  locale?: SupportedLocale;
  cookie?: string;
  authProvider?: AuthProvider;
  imageProvider?: RecipeImageProvider;
  logger?: SmartRecipeLogger;
  adapter?: DeviceAdapter;
  payload?: any;
}

export interface UploadSmartRecipeResult {
  uploadedImage?: any;
  recipeImage?: any;
  draft?: unknown;
  recipeUrl?: string;
  payload: any;
}

// ─── Phase 1: Generate ────────────────────────────────────────────────────────

/**
 * Generates a Smart recipe from a retrieved recipe page.
 * Does NOT upload anything – use uploadSmartRecipe() for that.
 */
export async function generateSmartRecipe(options: GenerateSmartRecipeOptions): Promise<GenerateSmartRecipeResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";
  const adapter = options.adapter ?? new MonsieurCuisineAdapter();

  logger.info({ model: options.openAIModel, reasoning: options.reasoningEffort }, "generating Smart recipe");
  const generator = new OpenAIRecipeGenerator({
    model: options.openAIModel,
    reasoningEffort: options.reasoningEffort,
    locale,
    excludeModes: options.excludeModes,
    adapter
  });
  const recipeInput = await generator.generate(options.page, { locale, excludeModes: options.excludeModes });
  const payload = adapter.createPayload(recipeInput);

  return { page: options.page, recipeInput, payload };
}

// ─── Phase 2: Upload ──────────────────────────────────────────────────────────

/**
 * Uploads a previously generated Smart recipe to Monsieur Cuisine or Cookidoo.
 * Handles image upload, draft creation, and returns the draft URL.
 */
export async function uploadSmartRecipe(options: UploadSmartRecipeOptions): Promise<UploadSmartRecipeResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";
  const adapter = options.adapter ?? new MonsieurCuisineAdapter();

  const payload = options.payload ?? adapter.createPayload(options.recipeInput);

  const uploadResult = await adapter.upload({
    payload,
    recipeInput: options.recipeInput,
    page: options.page,
    locale,
    cookie: options.cookie ?? "",
    logger,
    imageProvider: options.imageProvider,
    authProvider: options.authProvider
  });

  return {
    uploadedImage: uploadResult.uploadedImage,
    recipeImage: uploadResult.recipeImage,
    draft: uploadResult.draft,
    recipeUrl: uploadResult.recipeUrl,
    payload: uploadResult.payload
  };
}

// ─── Legacy combined helpers (kept for backward compatibility) ────────────────

export async function importRecipeFromUrl(options: ImportRecipeFromUrlOptions): Promise<ImportRecipeFromUrlResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";

  logger.info({ url: options.url }, "retrieving recipe page");
  const source = options.source ?? detectRecipeSource(options.url, { source: options.sourceType });
  const page = source.type === "web"
    ? await new RecipePageRetriever().retrieve(source.url)
    : await fetchRecipeSourceAsPage(source, {
        cookies: options.sourceCookies,
        locale,
        includeImageBytes: true,
      });

  return importRecipe({
    ...options,
    page,
    locale
  });
}

export async function importRecipe(options: ImportRecipeOptions): Promise<ImportRecipeFromUrlResult> {
  const { page, recipeInput, payload } = await generateSmartRecipe({
    page: options.page,
    locale: options.locale,
    openAIModel: options.openAIModel,
    reasoningEffort: options.reasoningEffort,
    excludeModes: options.excludeModes,
    logger: options.logger,
    adapter: options.adapter
  });

  if (!options.dryRun) {
    const uploadResult = await uploadSmartRecipe({
      page,
      recipeInput,
      locale: options.locale,
      cookie: options.cookie,
      authProvider: options.authProvider,
      imageProvider: options.imageProvider,
      logger: options.logger,
      adapter: options.adapter,
      payload
    });

    return {
      page,
      recipeInput,
      payload: uploadResult.payload,
      uploadedImage: uploadResult.uploadedImage,
      recipeImage: uploadResult.recipeImage,
      draft: uploadResult.draft,
      recipeUrl: uploadResult.recipeUrl
    };
  }

  return { page, recipeInput, payload };
}

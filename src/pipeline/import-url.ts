import { Buffer } from "node:buffer";
import { createLogger, type SmartRecipeLogger } from "../logging/logger.js";
import { OpenAIRecipeGenerator } from "../llm/openai-generator.js";
import { CookieAuthProvider, type AuthProvider } from "../mc/auth.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
import { createSmartRecipePayload } from "../recipes/payload.js";
import type { RecipeInput } from "../recipes/schema.js";
import type { SmartRecipePayload } from "../recipes/types.js";
import { RecipePageRetriever } from "../retriever/retriever.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { ReasoningEffort, RecipeGenerationOptions } from "../llm/types.js";
import type { SupportedLocale } from "../catalogs/types.js";
import type { PromptModeType } from "../recipes/types.js";
import { RetrievedRecipeImageProvider, type RecipeImageAsset, type RecipeImageProvider } from "./images.js";

export interface ImportRecipeFromUrlOptions {
  url: string;
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
}

export interface ImportRecipeFromUrlResult {
  page: RetrievedRecipePage;
  recipeInput: RecipeInput;
  payload: SmartRecipePayload;
  uploadedImage?: { detailsMediaId: number; thumbnailMediaId: number };
  recipeImage?: Omit<RecipeImageAsset, "bytes"> & { bytes: number };
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
}

export interface GenerateSmartRecipeResult {
  page: RetrievedRecipePage;
  recipeInput: RecipeInput;
  payload: SmartRecipePayload;
}

// ─── Upload-only options ──────────────────────────────────────────────────────

export interface UploadSmartRecipeOptions {
  page: RetrievedRecipePage;
  recipeInput: RecipeInput;
  locale?: SupportedLocale;
  cookie?: string;
  authProvider?: AuthProvider;
  imageProvider?: RecipeImageProvider;
  logger?: SmartRecipeLogger;
}

export interface UploadSmartRecipeResult {
  uploadedImage?: { detailsMediaId: number; thumbnailMediaId: number };
  recipeImage?: Omit<RecipeImageAsset, "bytes"> & { bytes: number };
  draft?: unknown;
  recipeUrl?: string;
  payload: SmartRecipePayload;
}

// ─── Phase 1: Generate ────────────────────────────────────────────────────────

/**
 * Generates a Smart recipe from a retrieved recipe page.
 * Does NOT upload anything – use uploadSmartRecipe() for that.
 */
export async function generateSmartRecipe(options: GenerateSmartRecipeOptions): Promise<GenerateSmartRecipeResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";

  logger.info({ model: options.openAIModel, reasoning: options.reasoningEffort }, "generating Smart recipe");
  const generator = new OpenAIRecipeGenerator({
    model: options.openAIModel,
    reasoningEffort: options.reasoningEffort,
    locale,
    excludeModes: options.excludeModes
  });
  const recipeInput = await generator.generate(options.page, { locale, excludeModes: options.excludeModes });
  const payload = createSmartRecipePayload({ ...recipeInput, thumbnailMediaId: null, detailsImageMediaId: null });

  return { page: options.page, recipeInput, payload };
}

// ─── Phase 2: Upload ──────────────────────────────────────────────────────────

/**
 * Uploads a previously generated Smart recipe to Monsieur Cuisine.
 * Handles image upload, draft creation, and returns the draft URL.
 */
export async function uploadSmartRecipe(options: UploadSmartRecipeOptions): Promise<UploadSmartRecipeResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";

  const client = new MonsieurCuisineSmartClient({
    authProvider: options.authProvider ?? (options.cookie ? new CookieAuthProvider(options.cookie) : undefined),
    cookie: options.cookie,
    locale,
    logger
  });

  const imageProvider = options.imageProvider ?? new RetrievedRecipeImageProvider();
  const recipeImage = await imageProvider.getImage(options.page, options.recipeInput);

  let uploadedImage: { detailsMediaId: number; thumbnailMediaId: number } | undefined;
  let thumbnailMediaId: number | null = null;
  let detailsImageMediaId: number | null = null;

  if (recipeImage) {
    logger.info({ imageSource: recipeImage.source, imageUrl: recipeImage.sourceUrl }, "uploading recipe image");
    uploadedImage = await client.uploadRecipeImage(Buffer.from(recipeImage.bytes), {
      locale,
      mimeType: recipeImage.contentType
    });
    thumbnailMediaId = uploadedImage.thumbnailMediaId;
    detailsImageMediaId = uploadedImage.detailsMediaId;
  }

  const uploadPayload = createSmartRecipePayload({ ...options.recipeInput, thumbnailMediaId, detailsImageMediaId });
  logger.info({ title: uploadPayload.title }, "creating Monsieur Cuisine draft");
  const draft = await client.createRecipe(uploadPayload, { locale });
  const id = typeof draft === "object" && draft && "id" in draft ? Number((draft as { id: unknown }).id) : undefined;
  const recipeUrl = id ? client.recipeUrl(id, locale) : undefined;

  return {
    uploadedImage,
    recipeImage: recipeImage ? { ...recipeImage, bytes: recipeImage.bytes.byteLength } : undefined,
    draft,
    recipeUrl,
    payload: uploadPayload
  };
}

// ─── Legacy combined helpers (kept for backward compatibility) ────────────────

export async function importRecipeFromUrl(options: ImportRecipeFromUrlOptions): Promise<ImportRecipeFromUrlResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";

  logger.info({ url: options.url }, "retrieving recipe page");
  const page = await new RecipePageRetriever().retrieve(options.url);

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
    logger: options.logger
  });

  if (!options.dryRun) {
    const uploadResult = await uploadSmartRecipe({
      page,
      recipeInput,
      locale: options.locale,
      cookie: options.cookie,
      authProvider: options.authProvider,
      imageProvider: options.imageProvider,
      logger: options.logger
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

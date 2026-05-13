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
import type { ReasoningEffort } from "../llm/types.js";
import type { SupportedLocale } from "../catalogs/types.js";
import { RetrievedRecipeImageProvider, type RecipeImageAsset, type RecipeImageProvider } from "./images.js";

export interface ImportRecipeFromUrlOptions {
  url: string;
  dryRun?: boolean;
  fullResponse?: boolean;
  locale?: SupportedLocale;
  openAIModel?: string;
  reasoningEffort?: ReasoningEffort;
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

export async function importRecipeFromUrl(options: ImportRecipeFromUrlOptions): Promise<ImportRecipeFromUrlResult> {
  const logger = options.logger ?? createLogger();
  const locale = options.locale ?? "de-DE";

  logger.info({ url: options.url }, "retrieving recipe page");
  const page = await new RecipePageRetriever().retrieve(options.url);

  logger.info({ model: options.openAIModel, reasoning: options.reasoningEffort }, "generating Smart recipe");
  const generator = new OpenAIRecipeGenerator({
    model: options.openAIModel,
    reasoningEffort: options.reasoningEffort,
    locale
  });
  const recipeInput = await generator.generate(page, { locale });

  let uploadedImage: { detailsMediaId: number; thumbnailMediaId: number } | undefined;
  let thumbnailMediaId: number | null = null;
  let detailsImageMediaId: number | null = null;
  let draft: unknown;
  let recipeUrl: string | undefined;

  if (!options.dryRun) {
    const client = new MonsieurCuisineSmartClient({
      authProvider: options.authProvider ?? (options.cookie ? new CookieAuthProvider(options.cookie) : undefined),
      cookie: options.cookie,
      locale,
      logger
    });

    const imageProvider = options.imageProvider ?? new RetrievedRecipeImageProvider();
    const recipeImage = await imageProvider.getImage(page, recipeInput);
    if (recipeImage) {
      logger.info({ imageSource: recipeImage.source, imageUrl: recipeImage.sourceUrl }, "uploading recipe image");
      uploadedImage = await client.uploadRecipeImage(Buffer.from(recipeImage.bytes), {
        locale,
        mimeType: recipeImage.contentType
      });
      thumbnailMediaId = uploadedImage.thumbnailMediaId;
      detailsImageMediaId = uploadedImage.detailsMediaId;
    }

    const uploadPayload = createSmartRecipePayload({ ...recipeInput, thumbnailMediaId, detailsImageMediaId });
    logger.info({ title: uploadPayload.title }, "creating Monsieur Cuisine draft");
    draft = await client.createRecipe(uploadPayload, { locale });
    const id = typeof draft === "object" && draft && "id" in draft ? Number((draft as { id: unknown }).id) : undefined;
    recipeUrl = id ? client.recipeUrl(id, locale) : undefined;
    return {
      page,
      recipeInput,
      payload: uploadPayload,
      uploadedImage,
      recipeImage: recipeImage ? { ...recipeImage, bytes: recipeImage.bytes.byteLength } : undefined,
      draft,
      recipeUrl
    };
  }

  const payload = createSmartRecipePayload({ ...recipeInput, thumbnailMediaId, detailsImageMediaId });
  return { page, recipeInput, payload };
}

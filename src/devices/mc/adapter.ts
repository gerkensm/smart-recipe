import { Buffer } from "node:buffer";
import type { DeviceAdapter, DevicePromptOptions, RecipeUploadLogger } from "../adapter.js";
import type { RetrievedRecipePage } from "../../retriever/types.js";
import { RecipeInputSchema, type RecipeInput, type SmartRecipePayload } from "../../recipes/schema.js";
import { buildRecipeInstructions } from "../../llm/prompts.js";
import { validateRecipeInput } from "../../recipes/validation.js";
import { normalizeRecipeInput } from "../../recipes/normalize.js";
import { formatRecipeTerminal } from "../../recipes/printer.js";
import { browserLoginForMonsieurCuisine } from "../../mc/browser-login.js";
import { MonsieurCuisineSmartClient } from "../../mc/client.js";
import { createSmartRecipePayload } from "../../recipes/payload.js";
import { CookieAuthProvider } from "../../mc/auth.js";
import type { AuthProvider } from "../../mc/auth.js";
import { RetrievedRecipeImageProvider, type RecipeImageProvider } from "../../pipeline/images.js";
import type { SupportedLocale } from "../../catalogs/types.js";
import type { SmartRecipeLogger } from "../../logging/logger.js";

export class MonsieurCuisineAdapter implements DeviceAdapter<RecipeInput, SmartRecipePayload> {
  readonly id = "mc" as const;
  readonly deviceName = "MonsieurCuisine" as const;

  getSchema() {
    return RecipeInputSchema;
  }

  getPromptInstructions(locale: string, options?: DevicePromptOptions) {
    return buildRecipeInstructions(locale as SupportedLocale, options?.excludeModes as Parameters<typeof buildRecipeInstructions>[1]);
  }

  validateInput(input: unknown) {
    return validateRecipeInput(input);
  }

  normalizeInput(input: RecipeInput): RecipeInput {
    return normalizeRecipeInput(input);
  }

  formatInputForTerminal(input: RecipeInput): string {
    return formatRecipeTerminal(input);
  }

  async browserLogin(options: {
    locale?: string;
    userDataDir?: string;
    timeoutMs?: number;
    headless?: boolean;
    keepOpen?: boolean;
    installBrowsers?: boolean;
    browserChannel?: string;
    browserPath?: string;
    browserSandbox?: boolean;
    credentials?: { email: string; password?: string };
    onStatus?: (message: string) => void;
  }) {
    return browserLoginForMonsieurCuisine({
      locale: (options.locale ?? "de-DE") as SupportedLocale,
      userDataDir: options.userDataDir,
      timeoutMs: options.timeoutMs,
      headless: options.headless,
      keepOpen: options.keepOpen,
      installBrowsers: options.installBrowsers,
      browserChannel: options.browserChannel,
      browserPath: options.browserPath,
      browserSandbox: options.browserSandbox,
      credentials: options.credentials,
      onStatus: options.onStatus,
    });
  }

  async getCurrentUser(cookie: string) {
    const client = new MonsieurCuisineSmartClient({ cookie });
    return client.getCurrentUser();
  }

  async listDrafts(options: { cookie: string; page?: number; size?: number }) {
    const client = new MonsieurCuisineSmartClient({ cookie: options.cookie });
    const result = await client.listDrafts({ page: options.page, size: options.size });
    const resultObject = result && typeof result === "object" ? result as { data?: { recipes?: McDraftRecipe[]; total?: number; totalPage?: number } } : {};
    const recipes = (resultObject.data?.recipes ?? []).map((recipe) => {
      const id = recipe.id;
      const numericId = Number(id);
      return {
        id,
        title: recipe.title,
        status: recipe.status,
        updatedAt: recipe.updatedAt,
        deviceTypes: recipe.deviceTypes,
        ingredientCount: recipe.ingredientCount,
        stepCount: recipe.stepCount,
        hasImage: recipe.hasImage,
        hasHints: recipe.hasHints,
        recipeUrl: Number.isFinite(numericId) ? client.recipeUrl(numericId) : recipe.recipeUrl,
      };
    });

    return {
      ...(result && typeof result === "object" ? result : {}),
      data: {
        ...resultObject.data,
        recipes,
        total: resultObject.data?.total ?? recipes.length,
        totalPage: resultObject.data?.totalPage ?? 1,
      },
    };
  }

  async getRecipe(options: { cookie: string; id: string; public?: boolean }) {
    const client = new MonsieurCuisineSmartClient({ cookie: options.cookie });
    const res = await client.getRecipe(options.id);
    const response = res && typeof res === "object" ? res as { data?: { recipe?: unknown } } : undefined;
    return response?.data?.recipe ?? res;
  }

  createPayload(input: RecipeInput): SmartRecipePayload {
    return createSmartRecipePayload({ ...input, thumbnailMediaId: null, detailsImageMediaId: null });
  }

  async upload(options: {
    payload: SmartRecipePayload;
    recipeInput: RecipeInput;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: RecipeUploadLogger;
    imageProvider?: RecipeImageProvider<RecipeInput>;
    authProvider?: AuthProvider;
  }) {
    const logger = options.logger;
    const locale = (options.locale ?? "de-DE") as SupportedLocale;

    const client = new MonsieurCuisineSmartClient({
      authProvider: options.authProvider ?? new CookieAuthProvider(options.cookie),
      cookie: options.cookie,
      locale,
      logger: logger as SmartRecipeLogger,
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
        mimeType: recipeImage.contentType,
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
      payload: uploadPayload,
    };
  }
}

interface McDraftRecipe {
  id?: string | number;
  title?: string;
  status?: string;
  updatedAt?: string;
  deviceTypes?: unknown;
  ingredientCount?: number;
  stepCount?: number;
  hasImage?: boolean;
  hasHints?: boolean;
  recipeUrl?: string;
}

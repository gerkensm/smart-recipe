import { Buffer } from "node:buffer";
import type { DeviceAdapter } from "../adapter.js";
import type { RetrievedRecipePage } from "../../retriever/types.js";
import { RecipeInputSchema } from "../../recipes/schema.js";
import { buildRecipeInstructions } from "../../llm/prompts.js";
import { validateRecipeInput } from "../../recipes/validation.js";
import { normalizeRecipeInput } from "../../recipes/normalize.js";
import { formatRecipeTerminal } from "../../recipes/printer.js";
import { browserLoginForMonsieurCuisine } from "../../mc/browser-login.js";
import { MonsieurCuisineSmartClient } from "../../mc/client.js";
import { createSmartRecipePayload } from "../../recipes/payload.js";
import { CookieAuthProvider } from "../../mc/auth.js";
import { RetrievedRecipeImageProvider } from "../../pipeline/images.js";
import type { SupportedLocale } from "../../catalogs/types.js";

export class MonsieurCuisineAdapter implements DeviceAdapter {
  readonly id = "mc" as const;
  readonly deviceName = "MonsieurCuisine" as const;

  getSchema(options?: any) {
    return RecipeInputSchema;
  }

  getPromptInstructions(locale: string, options?: any) {
    return buildRecipeInstructions(locale as SupportedLocale, options?.excludeModes);
  }

  validateInput(input: unknown) {
    return validateRecipeInput(input);
  }

  normalizeInput(input: any) {
    return normalizeRecipeInput(input);
  }

  formatInputForTerminal(input: any) {
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
    const result = await client.listDrafts({ page: options.page, size: options.size }) as any;
    const recipes = (result?.data?.recipes ?? []).map((recipe: any) => {
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
      ...result,
      data: {
        ...result?.data,
        recipes,
        total: result?.data?.total ?? recipes.length,
        totalPage: result?.data?.totalPage ?? 1,
      },
    };
  }

  async getRecipe(options: { cookie: string; id: string; public?: boolean }) {
    const client = new MonsieurCuisineSmartClient({ cookie: options.cookie });
    const res = await client.getRecipe(options.id) as any;
    return res?.data?.recipe ?? res;
  }

  createPayload(input: any) {
    return createSmartRecipePayload({ ...input, thumbnailMediaId: null, detailsImageMediaId: null });
  }

  async upload(options: {
    payload: any;
    recipeInput: any;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: any;
    imageProvider?: any;
    authProvider?: any;
  }) {
    const logger = options.logger;
    const locale = (options.locale ?? "de-DE") as SupportedLocale;

    const client = new MonsieurCuisineSmartClient({
      authProvider: options.authProvider ?? new CookieAuthProvider(options.cookie),
      cookie: options.cookie,
      locale,
      logger,
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

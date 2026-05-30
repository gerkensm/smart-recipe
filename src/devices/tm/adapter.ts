import { Buffer } from "node:buffer";
import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import type { DeviceAdapter, DevicePromptOptions, RecipeUploadLogger } from "../adapter.js";
import type { RetrievedRecipePage } from "../../retriever/types.js";
import { CookidooRecipeInputSchema, type CookidooRecipeInput } from "./schema.js";
import { createCookidooMetaPatch, createCookidooInstructions, getImageDimensions, type CookidooPayload } from "./payload.js";
import { buildCookidooRecipeInstructions } from "./prompts.js";
import { browserLoginForCookidoo, passwordLoginForCookidoo } from "./browser-login.js";
import { COOKIDOO_IMAGE_UPLOAD_PRESET, CookidooClient } from "./client.js";
import { RetrievedRecipeImageProvider, type RecipeImageProvider } from "../../pipeline/images.js";
import { extractJsonLd, findRecipeObjects } from "../../retriever/json-ld.js";
import type { SupportedLocale } from "../../catalogs/types.js";
import { formatAjvValidationErrors } from "../../recipes/validation.js";


const ansi = {
  reset: "\x1b[0m\x1b[24m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightMagenta: "\x1b[95m",
  gray: "\x1b[90m",
};

type CookidooModeInput = NonNullable<CookidooRecipeInput["steps"][number]["modeAnnotations"]>[number]["mode"];
type CookidooValidator = { (data: unknown): boolean; errors?: ErrorObject[] | null };

const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => {
  compile(schema: unknown): CookidooValidator;
};
const cookidooAjv = new Ajv2020({ allErrors: true, strict: false });
const cookidooRecipeInputValidator = cookidooAjv.compile(CookidooRecipeInputSchema);

export class ThermomixAdapter implements DeviceAdapter<CookidooRecipeInput, CookidooPayload> {
  readonly id = "tm" as const;
  readonly deviceName = "Thermomix" as const;

  getSchema() {
    return CookidooRecipeInputSchema;
  }

  getPromptInstructions(locale: string, options?: DevicePromptOptions) {
    return buildCookidooRecipeInstructions(locale as SupportedLocale, options);
  }

  validateInput(input: unknown) {
    const ok = cookidooRecipeInputValidator(input);
    return ok
      ? { ok, errors: [] }
      : formatAjvValidationErrors(CookidooRecipeInputSchema, input, cookidooRecipeInputValidator.errors);
  }

  normalizeInput(input: CookidooRecipeInput): CookidooRecipeInput {
    return {
      ...input,
      title: (input.title ?? "").trim(),
      ingredients: (input.ingredients ?? []).map((i) => ({
        id: (i.id ?? "").trim(),
        text: (i.text ?? "").trim(),
      })),
      steps: (input.steps ?? []).map((step) => ({
        text: (step.text ?? "").trim(),
        ingredientAnnotations: (step.ingredientAnnotations ?? []).map((ann) => ({
          ...ann,
          matchedSubstring: (ann.matchedSubstring ?? "").trim(),
          ingredientId: (ann.ingredientId ?? "").trim(),
        })),
        modeAnnotations: (step.modeAnnotations ?? []).map((ann) => ({
          ...ann,
          matchedSubstring: (ann.matchedSubstring ?? "").trim(),
        })),
      })),
    } as CookidooRecipeInput;
  }

  formatInputForTerminal(input: CookidooRecipeInput): string {
    const parts: string[] = [];
    parts.push("");
    parts.push(`  ${ansi.gray}┌${"─".repeat(input.title.length + 4)}┐${ansi.reset}`);
    parts.push(`  ${ansi.gray}│  ${ansi.reset}${ansi.bold}${ansi.brightMagenta}${input.title}${ansi.reset}${ansi.gray}  │${ansi.reset}`);
    parts.push(`  ${ansi.gray}└${"─".repeat(input.title.length + 4)}┘${ansi.reset}`);
    parts.push("");

    const metrics = [
      `👥 ${ansi.bold}${input.servingSize} ${input.servingUnitText}${ansi.reset}`,
      `🕒 Prep: ${ansi.bold}${input.prepTime} Min.${ansi.reset}`,
      `🏁 Total: ${ansi.bold}${input.totalTime} Min.${ansi.reset}`,
    ];
    parts.push("  " + metrics.join("   "));
    parts.push("");

    parts.push(`  ${ansi.bold}${ansi.underline}Ingredients:${ansi.reset}`);
    parts.push("");
    for (const ing of input.ingredients) {
      parts.push(`    • ${ing.text}`);
    }
    parts.push("");

    parts.push(`  ${ansi.bold}${ansi.underline}Steps:${ansi.reset}`);
    parts.push("");
    input.steps.forEach((step, idx) => {
      interface ResolvedAnnotation {
        type: "INGREDIENT" | "MODE";
        offset: number;
        length: number;
        matchedSubstring: string;
        data: string | CookidooModeInput;
      }

      const searchOffsets: Record<string, number> = {};
      const resolved: ResolvedAnnotation[] = [];

      if (step.ingredientAnnotations) {
        for (const ann of step.ingredientAnnotations) {
          const term = ann.matchedSubstring;
          const startFrom = searchOffsets[term] ?? 0;
          const offset = step.text.indexOf(term, startFrom);
          if (offset !== -1) {
            const ingObj = input.ingredients.find(i => i.id === ann.ingredientId);
            resolved.push({
              type: "INGREDIENT",
              offset,
              length: term.length,
              matchedSubstring: term,
              data: ingObj ? ingObj.text : "",
            });
            searchOffsets[term] = offset + term.length;
          }
        }
      }

      if (step.modeAnnotations) {
        for (const ann of step.modeAnnotations) {
          const term = ann.matchedSubstring;
          const startFrom = searchOffsets[term] ?? 0;
          const offset = step.text.indexOf(term, startFrom);
          if (offset !== -1) {
            resolved.push({
              type: "MODE",
              offset,
              length: term.length,
              matchedSubstring: term,
              data: ann.mode,
            });
            searchOffsets[term] = offset + term.length;
          }
        }
      }

      resolved.sort((a, b) => a.offset - b.offset);

      let inlineText = "";
      let lastIndex = 0;

      for (const ann of resolved) {
        if (ann.offset > lastIndex) {
          inlineText += step.text.slice(lastIndex, ann.offset);
        }

        const annText = step.text.slice(ann.offset, ann.offset + ann.length);
        if (ann.type === "INGREDIENT") {
          inlineText += `${ansi.bold}${annText}${ansi.reset}`;
          if (ann.data) {
            inlineText += `${ansi.gray} ["${ann.data}"]${ansi.reset}`;
          }
        } else if (ann.type === "MODE") {
          inlineText += `${ansi.brightYellow}${ansi.bold}${annText}${ansi.reset}`;
        }

        lastIndex = ann.offset + ann.length;
      }

      if (lastIndex < step.text.length) {
        inlineText += step.text.slice(lastIndex);
      }

      parts.push(`    ${ansi.bold}${ansi.brightGreen}${idx + 1}.${ansi.reset} ${inlineText}`);

      // Print mode details on a separate line below the step
      for (const ann of resolved) {
        if (ann.type === "MODE") {
          const m = ann.data as CookidooModeInput;
          const params: string[] = [];
          if (m.type === "dough") {
            params.push(`${m.time}s`);
          } else if (m.type === "blend") {
            if (m.time) params.push(`${m.time}s`);
            params.push(`Speed ${m.speed}`);
          } else if (m.type === "turbo") {
            params.push(`${m.pulseDuration}s/pulse`);
            if (m.pulseCount) params.push(`${m.pulseCount}x`);
          } else if (m.type === "warmUp") {
            params.push(`${m.temperature}°C`);
            params.push(`Speed ${m.speed}`);
          } else if (m.type === "steaming") {
            params.push(`${m.time}s`);
            params.push(`Speed ${m.speed}`);
            if (m.direction) params.push(m.direction);
            if (m.accessory) params.push(m.accessory);
          } else if (m.type === "browning") {
            params.push(`${m.time}s`);
            params.push(`${m.temperature}°C`);
            if (m.power) params.push(m.power);
          }
          parts.push(`      ${ansi.bold}${ansi.brightYellow}[Mode: ${m.type} | "${ann.matchedSubstring}"${params.length > 0 ? " | " + params.join(", ") : ""}]${ansi.reset}`);
        }
      }

    });
    parts.push("");

    return parts.join("\n");
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
    const result = await browserLoginForCookidoo({
      locale: options.locale,
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
    return {
      cookie: result.cookie,
      source: result.source,
      cookieNames: result.cookieNames,
    };
  }

  async passwordLogin(options: {
    locale?: string;
    credentials: { email: string; password: string };
  }) {
    const result = await passwordLoginForCookidoo({
      locale: options.locale,
      credentials: options.credentials,
    });
    return {
      cookie: result.cookie,
      source: result.source,
      cookieNames: result.cookieNames,
    };
  }

  async getCurrentUser(cookie: string) {
    const client = new CookidooClient({ cookie, locale: "de-DE" });
    return client.request<any>({
      method: "GET",
      path: "/community/profile",
      accept: "application/json",
    });
  }

  async listDrafts(options: { cookie: string; page?: number; size?: number }) {
    const locale = (process.env.TM_LOCALE ?? "de-DE") as string;
    const client = new CookidooClient({ cookie: options.cookie, locale });
    const res = await client.request<any>({
      method: "GET",
      path: `/created-recipes/${client.language}`,
    });
    const candidateRecipes = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
    const allRecipes = Array.isArray(candidateRecipes) ? candidateRecipes : [];
    const size = options.size && options.size > 0 ? options.size : allRecipes.length;
    const page = options.page && options.page > 0 ? options.page : 1;
    const start = (page - 1) * size;
    const recipes = allRecipes.slice(start, start + size);
    return {
      data: {
        recipes: recipes.map((recipe: any) => ({
          id: recipe.recipeId,
          title: recipe.recipeContent?.name ?? recipe.name ?? "",
          status: recipe.workStatus ?? recipe.status ?? "ACTIVE",
          updatedAt: recipe.modifiedAt ?? recipe.createdAt,
          deviceTypes: recipe.recipeContent?.tools ?? recipe.recipeContent?.tool ?? ["Thermomix"],
          ingredientCount: recipe.recipeContent?.ingredients?.length ?? recipe.recipeContent?.recipeIngredient?.length,
          stepCount: recipe.recipeContent?.instructions?.length ?? recipe.recipeContent?.recipeInstructions?.length,
          hasImage: Boolean(recipe.recipeContent?.image || recipe.recipeContent?.descriptiveAssets?.length),
          hasHints: Boolean(recipe.recipeContent?.hints),
          recipeUrl: recipe.recipeId
            ? `https://${client.domain}/created-recipes/${client.language}/${encodeURIComponent(recipe.recipeId)}`
            : undefined,
        })),
        total: allRecipes.length,
        totalPage: size > 0 ? Math.max(1, Math.ceil(allRecipes.length / size)) : 1,
      },
    };
  }

  async getRecipe(options: { cookie: string; id: string; public?: boolean }) {
    const locale = (process.env.TM_LOCALE ?? "de-DE") as string;
    const client = new CookidooClient({ cookie: options.cookie, locale });
    
    const isOfficial = /^r\d+$/.test(options.id);
    const path = isOfficial
      ? `/recipes/recipe/${client.language}/${encodeURIComponent(options.id)}`
      : options.public
        ? `/created-recipes/public/recipes/${client.language}/${encodeURIComponent(options.id)}`
        : `/created-recipes/${client.language}/${encodeURIComponent(options.id)}`;

    const result = await client.request<any>({ method: "GET", path });
    
    if (isOfficial && typeof result === "string") {
      const jsonLd = extractJsonLd(result);
      const recipes = findRecipeObjects(jsonLd);
      if (recipes.length > 0) {
        return recipes[0];
      }
    }
    
    return result;
  }

  createPayload(input: CookidooRecipeInput): CookidooPayload {
    // TM payload is created via meta and instruction patches. We return the patches.
    return {
      meta: createCookidooMetaPatch(input),
      instructions: createCookidooInstructions(input),
    };
  }

  async upload(options: {
    payload: CookidooPayload;
    recipeInput: CookidooRecipeInput;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: RecipeUploadLogger;
    imageProvider?: RecipeImageProvider<CookidooRecipeInput>;
  }) {
    const logger = options.logger;
    const client = new CookidooClient({
      cookie: options.cookie,
      locale: options.locale,
    });

    const imageProvider = options.imageProvider ?? new RetrievedRecipeImageProvider();
    const recipeImage = await imageProvider.getImage(options.page, options.recipeInput);

    let uploadedImage: { public_id: string; format: string } | undefined;
    if (recipeImage) {
      logger.info({ imageSource: recipeImage.source, imageUrl: recipeImage.sourceUrl }, "uploading recipe image to Cookidoo via Cloudinary");
      try {
        const imageBuffer = Buffer.from(recipeImage.bytes);
        const dims = getImageDimensions(imageBuffer) ?? { width: 600, height: 600 };
        
        let x = 0;
        let y = 0;
        let w = dims.width;
        let h = dims.height;
        if (dims.width > dims.height) {
          x = Math.floor((dims.width - dims.height) / 2);
          w = dims.height;
          h = dims.height;
        } else if (dims.height > dims.width) {
          y = Math.floor((dims.height - dims.width) / 2);
          w = dims.width;
          h = dims.width;
        }
        const customCoordinates = `${x},${y},${w},${h}`;

        const timestamp = Math.floor(Date.now() / 1000);
        
        logger.info({ dims, customCoordinates }, "requesting Cookidoo upload signature");
        const { signature } = await client.requestImageSignature({
          timestamp,
          source: "uw",
          customCoordinates,
          uploadPreset: COOKIDOO_IMAGE_UPLOAD_PRESET,
        });

        logger.info({ signature }, "uploading to Cloudinary");
        const cloudinaryRes = await client.uploadImageToCloudinary({
          fileBytes: recipeImage.bytes,
          mimeType: recipeImage.contentType,
          timestamp,
          signature,
          source: "uw",
          customCoordinates,
        });

        uploadedImage = {
          public_id: cloudinaryRes.public_id,
          format: cloudinaryRes.format,
        };
        logger.info({ uploadedImage }, "successfully uploaded image to Cloudinary");
      } catch (err) {
        logger.error(err, "failed to upload recipe image; proceeding without image");
      }
    }

    const delays = [30_000, 60_000, 90_000, 120_000];
    let attempt = 0;
    let draft: any = null;

    const publicUrl = `https://${client.domain}/created-recipes/public/recipes/${client.language}/01KB04WSJP4SHNBKJK4H4FT0PZ`;

    for (;;) {
      try {
        logger.info({ publicUrl, attempt }, "copying public dummy recipe to Cookidoo");
        draft = await client.request<any>({
          method: "POST",
          path: `/created-recipes/${client.language}`,
          body: {
            recipeUrl: publicUrl,
            servingSize: 1,
          },
        });
        break;
      } catch (err: any) {
        const isRateLimit =
          err.name === "CookidooRateLimitError" ||
          err.status === 429 ||
          (err.body && typeof err.body === "object" && err.body.code === "importFailed");

        if (!isRateLimit || attempt >= delays.length) {
          throw err;
        }

        const delayMs = Math.max(err.retryAfterMs ?? 0, delays[attempt]);
        logger.warn(
          { attempt: attempt + 1, delayMs },
          `rate limited by Cookidoo copy API. Retrying after delay...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempt += 1;
      }
    }

    const recipeId = extractCreatedRecipeId(draft);
    if (!recipeId) {
      logger.error({ draft }, "Cookidoo copy response did not include a recipe ID");
      throw new Error("Failed to copy public recipe draft. No recipe ID returned.");
    }

    const metaPatch = createCookidooMetaPatch(options.recipeInput);
    if (uploadedImage) {
      metaPatch.image = `${uploadedImage.public_id}.${uploadedImage.format}`;
      metaPatch.isImageOwnedByUser = false;
    }
    const instructions = createCookidooInstructions(options.recipeInput);

    logger.info({ recipeId, title: metaPatch.name }, "patching Cookidoo recipe metadata");
    const patchedMeta = await client.request<any>({
      method: "PATCH",
      path: `/created-recipes/${client.language}/${encodeURIComponent(recipeId)}`,
      body: metaPatch,
    });

    logger.info({ recipeId }, "patching Cookidoo recipe instructions");
    const patchedInstructions = await client.request<any>({
      method: "PATCH",
      path: `/created-recipes/${client.language}/${encodeURIComponent(recipeId)}`,
      body: { instructions },
    });

    const recipeUrl = `https://${client.domain}/created-recipes/${client.language}/${recipeId}`;

    return {
      uploadedImage,
      recipeImage: recipeImage ? { ...recipeImage, bytes: recipeImage.bytes.byteLength } : undefined,
      draft: {
        id: recipeId,
        title: metaPatch.name,
        status: "draft",
        recipeId,
      },
      recipeUrl,
      payload: {
        meta: metaPatch,
        instructions,
      },
    };
  }
}

function extractCreatedRecipeId(response: any): string | undefined {
  const candidates = [
    response?.recipeId,
    response?.id,
    response?.recipe?.recipeId,
    response?.recipe?.id,
    response?.data?.recipeId,
    response?.data?.id,
    response?.data?.recipe?.recipeId,
    response?.data?.recipe?.id,
    response?.createdRecipe?.recipeId,
    response?.createdRecipe?.id,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return value?.trim();
}

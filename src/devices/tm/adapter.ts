import { Buffer } from "node:buffer";
import Ajv2020Module from "ajv/dist/2020.js";
import type { DeviceAdapter } from "../adapter.js";
import type { RetrievedRecipePage } from "../../retriever/types.js";
import { CookidooRecipeInputSchema, type CookidooRecipeInput } from "./schema.js";
import { createCookidooMetaPatch, createCookidooInstructions, getImageDimensions } from "./payload.js";
import { buildCookidooRecipeInstructions } from "./prompts.js";
import { browserLoginForCookidoo } from "./browser-login.js";
import { CookidooClient } from "./client.js";
import { RetrievedRecipeImageProvider } from "../../pipeline/images.js";


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

export class ThermomixAdapter implements DeviceAdapter<CookidooRecipeInput, any> {
  readonly id = "tm" as const;
  readonly deviceName = "Thermomix" as const;

  getSchema(options?: any) {
    return CookidooRecipeInputSchema;
  }

  getPromptInstructions(locale: string, options?: any) {
    return buildCookidooRecipeInstructions(locale as any, options);
  }

  validateInput(input: unknown) {
    const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(CookidooRecipeInputSchema);
    const ok = validate(input);
    const errors = ok
      ? []
      : (validate.errors ?? []).map(
          (error: any) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`
        );
    return { ok, errors };
  }

  normalizeInput(input: any) {
    return {
      ...input,
      title: (input.title ?? "").trim(),
      ingredients: (input.ingredients ?? []).map((i: string) => i.trim()),
      steps: (input.steps ?? []).map((step: any) => ({
        ...step,
        text: (step.text ?? "").trim(),
        modeAnnotations: (step.modeAnnotations ?? []).map((ann: any) => ({
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
      parts.push(`    • ${ing}`);
    }
    parts.push("");

    parts.push(`  ${ansi.bold}${ansi.underline}Steps:${ansi.reset}`);
    parts.push("");
    input.steps.forEach((step, idx) => {
      parts.push(`    ${ansi.bold}${ansi.brightGreen}${idx + 1}.${ansi.reset} ${step.text}`);
      if (step.modeAnnotations && step.modeAnnotations.length > 0) {
        step.modeAnnotations.forEach((ann) => {
          const m = ann.mode;
          const params: string[] = [];
          if (m.type === "dough") {
            params.push(`${m.time}s`);
          } else if (m.type === "blend") {
            if (m.time) params.push(`${m.time}s`);
            params.push(`Speed ${m.speed}`);
          } else if (m.type === "turbo") {
            params.push(`${m.time}s`);
            if (m.pulseCount) params.push(`Pulses: ${m.pulseCount}`);
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
        });
      }
    });
    parts.push("");

    return parts.join("\n");
  }

  async browserLogin(options: {
    locale?: string;
    userDataDir?: string;
    timeoutMs?: number;
    keepOpen?: boolean;
    credentials?: { email: string; password?: string };
    onStatus?: (message: string) => void;
  }) {
    const result = await browserLoginForCookidoo({
      locale: options.locale,
      userDataDir: options.userDataDir,
      timeoutMs: options.timeoutMs,
      keepOpen: options.keepOpen,
      credentials: options.credentials,
      onStatus: options.onStatus,
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
    const client = new CookidooClient({ cookie: options.cookie, locale: "de-DE" });
    const res = await client.request<any>({
      method: "GET",
      path: `/created-recipes/${client.language}`,
    });
    const recipes = Array.isArray(res) ? res : res?.data ?? [];
    return {
      data: {
        recipes: recipes.map((recipe: any) => ({
          id: recipe.recipeId,
          title: recipe.recipeContent?.name ?? recipe.name ?? "",
          status: recipe.status ?? "ACTIVE",
          updatedAt: recipe.modifiedAt ?? recipe.createdAt,
          deviceTypes: ["Thermomix"],
        })),
        total: recipes.length,
        totalPage: 1,
      },
    };
  }

  createPayload(input: CookidooRecipeInput) {
    // TM payload is created via meta and instruction patches. We return the patches.
    return {
      meta: createCookidooMetaPatch(input),
      instructions: createCookidooInstructions(input),
    };
  }

  async upload(options: {
    payload: any;
    recipeInput: CookidooRecipeInput;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: any;
    imageProvider?: any;
    authProvider?: any;
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

    if (!draft || !draft.recipeId) {
      throw new Error("Failed to copy public recipe draft. No recipe ID returned.");
    }

    const recipeId = draft.recipeId;
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

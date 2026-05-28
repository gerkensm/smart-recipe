#!/usr/bin/env node
import process from "node:process";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword,
  select as inquirerSelect
} from "@inquirer/prompts";
import fs from "node:fs";
import tty from "node:tty";

let ttyStream: tty.ReadStream | undefined;

function getInteractiveInput() {
  if (process.platform === "win32") {
    return process.stdin;
  }
  // If stdin has ended (e.g. after pasting and Ctrl-D), we must read from /dev/tty
  if ((process.stdin as any).readableEnded || !(process.stdin as any).readable) {
    if (!ttyStream) {
      try {
        const fd = fs.openSync("/dev/tty", "r");
        ttyStream = new tty.ReadStream(fd);
      } catch (err) {
        return process.stdin;
      }
    }
    return ttyStream;
  }
  return process.stdin;
}

function confirm(options: Parameters<typeof inquirerConfirm>[0]) {
  return inquirerConfirm(options, { input: getInteractiveInput() });
}

function input(options: Parameters<typeof inquirerInput>[0]) {
  return inquirerInput(options, { input: getInteractiveInput() });
}

function password(options: Parameters<typeof inquirerPassword>[0]) {
  return inquirerPassword(options, { input: getInteractiveInput() });
}

function select<T>(options: Parameters<typeof inquirerSelect<T>>[0]) {
  return inquirerSelect<T>(options, { input: getInteractiveInput() });
}
import { loadDotEnv, upsertDotEnvValue, getTargetDevice, getTmVersion, mcHasFoodProcessor } from "../config/env.js";
import { categoryPromptText, plannedLocales, supportedLocales } from "../catalogs/index.js";
import { buildRecipeInstructions } from "../llm/prompts.js";
import { BrowserCookieAuthProvider, CookieAuthProvider } from "../mc/auth.js";
import { browserLoginForMonsieurCuisine } from "../mc/browser-login.js";
import { AuthFlowError, MonsieurCuisineApiError } from "../mc/errors.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
import { CookidooError } from "../devices/tm/errors.js";
import { getLocalization } from "../devices/tm/client.js";
import { getDeviceAdapter } from "../devices/index.js";
import {
  generateSmartRecipe,
  importRecipeFromUrl,
  uploadSmartRecipe,
  type GenerateSmartRecipeResult
} from "../pipeline/import-url.js";
import { RecipeInputSchema, formatRecipeTerminal } from "../recipes/index.js";
import { validateRecipeInput } from "../recipes/validation.js";
import { retrieveRecipePage } from "../retriever/retriever.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import { createLogger } from "../logging/logger.js";
import type { ReasoningEffort } from "../llm/types.js";
import { OpenAIRecipeImageGenerator } from "../llm/openai-image-generator.js";
import { NullImageProvider } from "../pipeline/images.js";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

function detectDeviceFromRecipe(json: any): "mc" | "tm" {
  if (json && (typeof json.servingSize === "number" || Array.isArray(json.steps))) {
    return "tm";
  }
  return "mc";
}

// @types/marked-terminal is outdated and doesn't know that markedTerminal() now returns a MarkedExtension.
// We cast it to `any` to bypass the type error until the DefinitelyTyped package is updated.
marked.use(markedTerminal() as any);

const GLOBAL_ENV_PATH = path.join(os.homedir(), ".smart-recipe");
loadDotEnv(GLOBAL_ENV_PATH, { override: false });
loadDotEnv(".env", { override: true });

const program = new Command();
program
  .name("smart-recipe")
  .description("Generate and upload Monsieur Cuisine Smart recipes.")
  .option("--env <path>", "Load a specific env file instead of the default local .env")
  .option("--log-level <level>", "Log level", process.env.LOG_LEVEL ?? "info")
  .option("--json", "Output results as machine-readable JSON instead of human-readable text")
  .option("--json-logs", "Write machine-readable JSON logs instead of pretty text logs")
  .hook("preAction", (command) => {
    const envPath = command.optsWithGlobals().env;
    if (envPath) loadDotEnv(envPath, { override: true });
  });

// ─── Shared import options helper ─────────────────────────────────────────────

function addImportOptions(cmd: Command): Command {
  return cmd
    .option("--dry-run", "Skip upload (overrides --yes)")
    .option("--yes", "Always upload without asking for confirmation")
    .option("--full-response", "Print the full result object")
    .option("--no-print-markdown", "Do not pretty-print the retrieved markdown to the console")
    .option("--model <model>", "OpenAI model", process.env.OPENAI_MODEL ?? "gpt-5.5")
    .option("--reasoning <effort>", "OpenAI reasoning effort: minimal, low, medium, high", process.env.OPENAI_REASONING_EFFORT ?? "medium")
    .option("--recreate-image", "Generate a new recipe image with OpenAI instead of uploading the source image")
    .option("--recreate-image-with-source-images", "When recreating the image, send downloaded website images as loose visual context")
    .option("--no-image", "Skip image generation entirely; upload without an image (skips the image prompt)")
    .option("--image-model <model>", "OpenAI image model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2")
    .option("--image-size <size>", "Generated image size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1024")
    .option("--image-quality <quality>", "Generated image quality: low, medium, high, auto", process.env.OPENAI_IMAGE_QUALITY ?? "medium")
    .option("--cookie <cookie>", "Browser Cookie header")
    .option("--exclude-modes <modes>", "Comma-separated list of Smart modes to exclude (e.g. foodProcessor)")
    .option("--device <device>", "Target device: 'mc' or 'tm'")
    .option("--tm-version <version>", "Target Thermomix model: 'tm7', 'tm6', or 'tm5'")
    .option("--mc-food-processor <boolean>", "Whether you own the Monsieur Cuisine food processor attachment (true/false)")
    .option("--extended-modes", "Enable modes not available in My Creations (e.g. cook/Garen for TM). Red in editor but usable via device.");
}

program
  .command("import-url")
  .description("Retrieve a recipe page, generate Smart recipe JSON with OpenAI, and optionally upload a draft.")
  .argument("<url>", "Recipe URL");
addImportOptions(program.commands.at(-1)!);
program.commands.at(-1)!.action(async (url, options) => {
  const logger = createLogger({
    level: program.optsWithGlobals().logLevel,
    pretty: !program.optsWithGlobals().jsonLogs,
    destination: 2
  });
  logger.info({ url }, "retrieving recipe page");
  const page = await retrieveRecipePage(url, { includeImageBytes: true });
  if (!program.optsWithGlobals().json && options.printMarkdown !== false) {
    console.log(`\n=== Retrieved Markdown from URL ===\n`);
    console.log(marked.parse(page.markdown));
    console.log(`===================================\n`);
  }
  await runImport(page, options, program.optsWithGlobals());
});

program
  .command("import-file")
  .description("Retrieve a recipe from a local text file, generate Smart recipe JSON with OpenAI, and optionally upload a draft.")
  .argument("<file>", "Recipe file path")
  .option("--title <title>", "Custom recipe title")
  .option("--url <url>", "Original recipe URL context");
addImportOptions(program.commands.at(-1)!);
program.commands.at(-1)!.action(async (file, options) => {
  const resolvedPath = path.resolve(file);
  const content = await readFile(resolvedPath, "utf8");
  const title = options.title || path.basename(resolvedPath, path.extname(resolvedPath));
  const url = options.url || "";

  const page: RetrievedRecipePage = {
    url,
    finalUrl: url,
    title,
    markdown: content,
    html: "",
    images: []
  };
  await runImport(page, options, program.optsWithGlobals());
});

program
  .command("import-stdin")
  .description("Retrieve a recipe from stdin, generate Smart recipe JSON with OpenAI, and optionally upload a draft.")
  .option("--title <title>", "Custom recipe title")
  .option("--url <url>", "Original recipe URL context");
addImportOptions(program.commands.at(-1)!);
program.commands.at(-1)!.action(async (options) => {
  let content: string;
  if (process.stdin.isTTY) {
    console.error("Please paste your recipe content below. Press Ctrl+D (or Ctrl+Z on Windows) followed by Enter when finished:\n");
    content = await readStdin();
  } else {
    content = await readStdin();
  }

  const title = options.title || "";
  const url = options.url || "";

  const page: RetrievedRecipePage = {
    url,
    finalUrl: url,
    title,
    markdown: content,
    html: "",
    images: []
  };
  await runImport(page, options, program.optsWithGlobals());
});

// ─── Interactive import wizard ────────────────────────────────────────────────

async function runImport(
  page: RetrievedRecipePage,
  options: any,
  programOpts: any
) {
  const isJsonMode = Boolean(programOpts.json);
  const isInteractive = !isJsonMode && process.stdout.isTTY && process.stdin.isTTY;

  const logger = createLogger({
    level: programOpts.logLevel,
    pretty: !programOpts.jsonLogs,
    destination: 2
  });

  if (options.mcFoodProcessor) {
    process.env.MC_HAS_FOOD_PROCESSOR = options.mcFoodProcessor.toLowerCase();
  }

  // ── Step 0: Determine target device ───────────────────────────────────────
  let targetDevice: "mc" | "tm";
  if (!process.env.TARGET_DEVICE && !options.device) {
    if (isInteractive) {
      console.log();
      targetDevice = await select({
        message: "Which smart cooker do you want to target?",
        choices: [
          { name: "Monsieur Cuisine (MC)", value: "mc" as const },
          { name: "Thermomix (TM)", value: "tm" as const }
        ]
      });

      let tmVersion: "tm7" | "tm6" | "tm5" | undefined;
      if (targetDevice === "tm") {
        tmVersion = await select({
          message: "Which Thermomix model do you own?",
          choices: [
            { name: "TM7", value: "tm7" as const },
            { name: "TM6", value: "tm6" as const },
            { name: "TM5", value: "tm5" as const }
          ]
        });
      }

      let mcHasFoodProcessor: boolean | undefined;
      if (targetDevice === "mc" && typeof process.env.MC_HAS_FOOD_PROCESSOR === "undefined") {
        mcHasFoodProcessor = await confirm({
          message: "Do you own the optional Food Processor (cutter) attachment for Monsieur Cuisine?",
          default: false
        });
      }

      const saveSettings = await confirm({
        message: "Save these cooker settings to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "TARGET_DEVICE", targetDevice);
        if (tmVersion) {
          upsertDotEnvValue(GLOBAL_ENV_PATH, "TM_VERSION", tmVersion);
        }
        if (mcHasFoodProcessor !== undefined) {
          upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_HAS_FOOD_PROCESSOR", String(mcHasFoodProcessor));
        }
        console.log(`✓ Saved device settings to ${GLOBAL_ENV_PATH}\n`);
      }
      if (tmVersion) {
        process.env.TM_VERSION = tmVersion;
      }
      if (mcHasFoodProcessor !== undefined) {
        process.env.MC_HAS_FOOD_PROCESSOR = String(mcHasFoodProcessor);
      }
      process.env.TARGET_DEVICE = targetDevice;
    } else {
      targetDevice = "mc"; // default
    }
  } else {
    const val = (options.device || process.env.TARGET_DEVICE || "mc").toLowerCase();
    targetDevice = (val === "tm" || val === "thermomix") ? "tm" : "mc";
  }

  if (options.tmVersion) {
    process.env.TM_VERSION = options.tmVersion.toLowerCase();
  }

  if (targetDevice === "tm" && !process.env.TM_VERSION) {
    if (isInteractive) {
      const tmVersion = await select({
        message: "Which Thermomix model do you own?",
        choices: [
          { name: "TM7", value: "tm7" as const },
          { name: "TM6", value: "tm6" as const },
          { name: "TM5", value: "tm5" as const }
        ]
      });
      const saveSettings = await confirm({
        message: "Save this Thermomix model to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "TM_VERSION", tmVersion);
        console.log(`✓ Saved TM_VERSION to ${GLOBAL_ENV_PATH}\n`);
      }
      process.env.TM_VERSION = tmVersion;
    } else {
      process.env.TM_VERSION = "tm6";
    }
  }

  if (targetDevice === "mc" && typeof process.env.MC_HAS_FOOD_PROCESSOR === "undefined") {
    if (isInteractive) {
      const mcHasFoodProcessor = await confirm({
        message: "Do you own the optional Food Processor (cutter) attachment for Monsieur Cuisine?",
        default: false
      });
      const saveSettings = await confirm({
        message: "Save this setting to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_HAS_FOOD_PROCESSOR", String(mcHasFoodProcessor));
        console.log(`✓ Saved MC_HAS_FOOD_PROCESSOR to ${GLOBAL_ENV_PATH}\n`);
      }
      process.env.MC_HAS_FOOD_PROCESSOR = String(mcHasFoodProcessor);
    } else {
      process.env.MC_HAS_FOOD_PROCESSOR = "false"; // default to false if non-interactive (default off)
    }
  }

  const adapter = getDeviceAdapter(targetDevice);

  // ── Step 1: Ensure we have an OpenAI API key ──────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    if (!isInteractive) {
      throw new Error("OPENAI_API_KEY is not set. Provide it via the environment or run interactively.");
    }

    console.log();
    console.log("  \x1b[1m\x1b[33m⚠  No OpenAI API key found.\x1b[0m");
    console.log("  You can get one at \x1b[36mhttps://platform.openai.com/api-keys\x1b[0m");
    console.log();

    const apiKey = await password({
      message: "  Paste your OpenAI API key",
      validate: (v) => {
        if (!v.trim()) return "API key cannot be empty.";
        if (!/^(sk-|proj-)/.test(v.trim())) return "This doesn't look like a valid OpenAI key (expected sk-… or proj-…).";
        return true;
      }
    });

    process.env.OPENAI_API_KEY = apiKey.trim();

    const saveKey = await confirm({
      message: "  Save this key to ~/.smart-recipe?",
      default: true
    });
    if (saveKey) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, "OPENAI_API_KEY", apiKey.trim());
      console.log(`  \x1b[32m✓ Saved to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
    }
  }

  // ── Step 2: Generate the recipe ───────────────────────────────────────────
  // Image provider is resolved later (Step 4.5), after the user confirms upload.
  // Pre-compute the flag values here so the logic below is cleaner.
  const imageExplicitMode: "generate" | "generate-with-sources" | "skip" | "none" | null =
    options.noImage ? "none"
    : options.recreateImageWithSourceImages ? "generate-with-sources"
    : options.recreateImage ? "generate"
    : null; // null = ask interactively

  const excludeModes: string[] = options.excludeModes
    ? options.excludeModes.split(",").map((m: string) => m.trim())
    : [];

  if (targetDevice === "mc" && !mcHasFoodProcessor()) {
    if (!excludeModes.includes("foodProcessor")) {
      excludeModes.push("foodProcessor");
    }
  }

  // cook mode (Garen) is not available for My Creations on Cookidoo — exclude by default.
  // Users can opt in with --extended-modes if they want to experiment.
  if (targetDevice === "tm" && !options.extendedModes) {
    if (!excludeModes.includes("cook")) {
      excludeModes.push("cook");
    }
  }

  const generated: GenerateSmartRecipeResult = await generateSmartRecipe({
    page,
    openAIModel: options.model,
    reasoningEffort: options.reasoning as ReasoningEffort,
    excludeModes: excludeModes.length > 0 ? (excludeModes as any) : undefined,
    logger,
    adapter
  });

  // ── Step 3: Display the recipe ────────────────────────────────────────────
  if (!isJsonMode) {
    console.log(adapter.formatInputForTerminal(generated.recipeInput));
  }

  // ── Step 4: Decide whether to upload ─────────────────────────────────────
  let shouldUpload: boolean;
  if (options.dryRun) {
    shouldUpload = false;
  } else if (options.yes) {
    shouldUpload = true;
  } else if (isInteractive) {
    console.log();
    shouldUpload = await confirm({
      message: `  Upload this recipe to ${adapter.deviceName}?`,
      default: false
    });
  } else {
    shouldUpload = false;
  }

  if (!shouldUpload) {
    if (!isJsonMode) {
      console.log("\n  \x1b[2m(Skipped upload. Run with --yes to always upload.)\x1b[0m\n");
    }
    printOutput(
      { title: generated.recipeInput.title, recipeInput: generated.recipeInput, payload: generated.payload },
      isJsonMode,
      options.fullResponse ? () => JSON.stringify(generated, null, 2) : undefined
    );
    return;
  }

  // ── Step 4.5: Resolve image provider ─────────────────────────────────────
  let imageMode: "generate" | "generate-with-sources" | "skip" | "none" | null = imageExplicitMode;
  if (imageMode === null && isInteractive) {
    const sourceImageCount = generated.page.images?.filter((img: any) => img.score >= 0.5).length ?? 0;
    const sourceHint = sourceImageCount > 0
      ? `  \x1b[2m(${sourceImageCount} potential recipe image${sourceImageCount !== 1 ? "s" : ""} found on the source page)\x1b[0m`
      : `  \x1b[2m(no suitable source images found on the page)\x1b[0m`;
    console.log(sourceHint);
    console.log();
    const imageChoice = await select<"skip" | "none" | "generate" | "generate-with-sources">({
      message: "  Recipe image?",
      choices: [
        {
          name: "Use the best image from the source website (if available)",
          value: "skip" as const,
        },
        {
          name: "No image – upload without any image",
          value: "none" as const,
        },
        {
          name: "Generate a fresh AI image (uses image generation credits)",
          value: "generate" as const,
        },
        ...(
          sourceImageCount > 0
            ? [{
                name: `Generate using website photos as visual reference (${sourceImageCount} image${sourceImageCount !== 1 ? "s" : ""})`,
                value: "generate-with-sources" as const,
              }]
            : []
        ),
      ],
      default: "skip",
    });
    imageMode = imageChoice;
  } else if (imageMode === null) {
    imageMode = "skip"; // non-interactive default: use source image
  }

  const imageProvider =
    imageMode === "none"
      ? new NullImageProvider()
      : imageMode === "skip" || imageMode === null
        ? undefined
        : new OpenAIRecipeImageGenerator({
            model: options.imageModel,
            size: options.imageSize,
            quality: options.imageQuality,
            includeSourceImages: imageMode === "generate-with-sources",
            logger,
          });

  // ── Step 5: Resolve authentication ───────────────────────────────────────
  let authProvider = await resolveAuthInteractively(options, isInteractive, adapter);

  // ── Step 6: Upload ────────────────────────────────────────────────────────
  let uploadResult;
  try {
    const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const activeCookie = options.cookie ?? process.env[cookieKey];
    uploadResult = await uploadSmartRecipe({
      page: generated.page,
      recipeInput: generated.recipeInput,
      cookie: activeCookie,
      authProvider,
      imageProvider,
      logger,
      adapter
    });
  } catch (error) {
    const isExpiredToken =
      (error instanceof MonsieurCuisineApiError &&
        (error.status === 401 ||
          error.code === 110002 ||
          (error.response &&
            typeof error.response === "object" &&
            (error.response as any).message === "ExpiredAuthCookieException"))) ||
      (error instanceof CookidooError &&
        (error.status === 401 || error.status === 403));

    if (isInteractive && isExpiredToken) {
      console.log(`\n  \x1b[31m✗ ${adapter.deviceName} session has expired or is invalid.\x1b[0m`);
      console.log("  Please authenticate to obtain a new session.");

      // Clear current expired session cookies to force fresh interactive auth
      const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
      delete process.env[cookieKey];
      options.cookie = undefined;

      // Ask for credentials / cookie again
      authProvider = await resolveAuthInteractively(options, isInteractive, adapter);

      // Attempt upload again with the new session
      const session = await authProvider.getSession();
      const newCookie = session.cookie;
      process.env[cookieKey] = newCookie;

      logger.info(`retrying ${adapter.deviceName} upload with new session`);
      uploadResult = await uploadSmartRecipe({
        page: generated.page,
        recipeInput: generated.recipeInput,
        cookie: newCookie,
        authProvider,
        imageProvider,
        logger,
        adapter
      });
    } else {
      throw error;
    }
  }

  const fullResult = {
    page: generated.page,
    recipeInput: generated.recipeInput,
    payload: uploadResult.payload,
    uploadedImage: uploadResult.uploadedImage,
    recipeImage: uploadResult.recipeImage,
    draft: uploadResult.draft,
    recipeUrl: uploadResult.recipeUrl
  };

  printOutput(
    options.fullResponse ? printableImportResult(fullResult) : summarizeImportResult(fullResult),
    isJsonMode,
    (v) => {
      if (options.fullResponse) return JSON.stringify(v, null, 2);
      const parts: string[] = [];
      if (v.recipeUrl) {
        parts.push(`\n  \x1b[1m\x1b[32m✓ Recipe uploaded successfully!\x1b[0m`);
        parts.push(`  \x1b[36m${v.recipeUrl}\x1b[0m`);
      } else {
        parts.push(`\n  \x1b[1m\x1b[32m✓ Draft created:\x1b[0m ${v.title}`);
        if (v.id) parts.push(`  Draft ID: ${v.id} (${v.status})`);
      }
      if (v.image) {
        if (typeof v.image.detailsMediaId !== "undefined") {
          parts.push(`  Image Media ID: ${v.image.detailsMediaId}`);
        } else if (v.image.public_id) {
          parts.push(`  Image Public ID: ${v.image.public_id} (${v.image.format})`);
        }
      }
      if (v.imageSource) parts.push(`  Image Source: ${v.imageSource}`);
      return parts.join("\n");
    }
  );
}

/**
 * Resolves a cooker auth provider interactively.
 */
async function resolveAuthInteractively(
  options: { cookie?: string },
  isInteractive: boolean,
  adapter: any
): Promise<any> {
  const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
  const currentCookie = options.cookie ?? process.env[cookieKey];

  if (currentCookie) {
    if (adapter.id === "tm") {
      return {
        async getSession() {
          return { cookie: currentCookie };
        }
      };
    } else {
      return new CookieAuthProvider(currentCookie);
    }
  }

  if (!isInteractive) {
    return makeSilentBrowserAuthProvider(adapter);
  }

  console.log();
  console.log(`  \x1b[1m\x1b[33m⚠  No ${adapter.deviceName} session found.\x1b[0m`);
  console.log();

  const method = await select({
    message: "  How would you like to authenticate?",
    choices: [
      {
        name: `Browser login  (opens ${adapter.deviceName} login window)`,
        value: "browser" as const,
        description: adapter.id === "tm"
          ? "A small Chromium window opens so you can\nsign in with your Cookidoo account."
          : "A small Chromium window opens so you can\nsign in with your Lidl Plus account."
      },
      {
        name: "Paste cookie   (enter Cookie header manually)",
        value: "cookie" as const,
        description: adapter.id === "tm"
          ? "Open cookidoo.de (or your local Cookidoo) in your browser,\ncopy the Cookie header from DevTools, and\npaste it here."
          : "Open monsieur-cuisine.com in your browser,\ncopy the Cookie header from DevTools, and\npaste it here."
      }
    ]
  });

  if (method === "browser") {
    try {
      return await attemptBrowserLogin(isInteractive, adapter);
    } catch (err) {
      console.log();
      console.log(`  \x1b[31m✗ Browser login failed.\x1b[0m Falling back to manual cookie.`);
      return await promptForManualCookie(adapter);
    }
  }

  return await promptForManualCookie(adapter);
}

/** Attempts a browser login, saves the cookie if the user agrees, and returns a CookieAuthProvider or custom session object. */
async function attemptBrowserLogin(isInteractive: boolean, adapter: any): Promise<any> {
  const isTm = adapter.id === "tm";
  const localeKey = isTm ? "TM_LOCALE" : "MC_LOCALE";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";
  const loginKey = isTm ? "TM_LOGIN" : "MC_LOGIN";
  const pwKey = isTm ? "TM_PW" : "MC_PW";

  const locale = (process.env[localeKey] ?? "de-DE") as any;
  console.log();
  const result = await adapter.browserLogin({
    locale,
    credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
    onStatus: (message: string) => console.error(`  \x1b[2m${message}\x1b[0m`)
  });

  if (isInteractive) {
    console.log();
    const saveCookie = await confirm({
      message: `  Save this session cookie to ~/.smart-recipe?`,
      default: true
    });
    if (saveCookie) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, cookieKey, result.cookie);
      console.log(`  \x1b[32m✓ Saved ${cookieKey} to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
    }
  }

  if (isTm) {
    return {
      async getSession() {
        return { cookie: result.cookie };
      }
    };
  } else {
    return new CookieAuthProvider(result.cookie);
  }
}

/**
 * Shows step-by-step instructions for obtaining a cookie manually,
 * then prompts the user to paste it in and offers to save it.
 */
async function promptForManualCookie(adapter: any): Promise<any> {
  const isTm = adapter.id === "tm";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";

  console.log();
  console.log("  \x1b[1mHow to get your Cookie header:\x1b[0m");
  if (isTm) {
    console.log("  1. Open \x1b[36mhttps://cookidoo.de\x1b[0m (or your local Cookidoo site) and log in.");
    console.log("  2. Open DevTools  \x1b[2m(F12 or Cmd+Option+I)\x1b[0m → Network tab.");
    console.log("  3. Reload the page, click any request to cookidoo.*.");
    console.log("  4. In the Request Headers, find \x1b[1mCookie:\x1b[0m and copy the full value.");
  } else {
    console.log("  1. Open \x1b[36mhttps://www.monsieur-cuisine.com\x1b[0m and log in with your Lidl Plus account.");
    console.log("  2. Open DevTools  \x1b[2m(F12 or Cmd+Option+I)\x1b[0m → Network tab.");
    console.log("  3. Reload the page, click any request to monsieur-cuisine.com.");
    console.log("  4. In the Request Headers, find \x1b[1mCookie:\x1b[0m and copy the full value.");
  }
  console.log();

  const cookie = await input({
    message: "  Paste your Cookie header",
    validate: (v) => (v.trim() ? true : "Cookie cannot be empty.")
  });

  const saveCookie = await confirm({
    message: "  Save this cookie to ~/.smart-recipe?",
    default: true
  });
  if (saveCookie) {
    upsertDotEnvValue(GLOBAL_ENV_PATH, cookieKey, cookie.trim());
    console.log(`  \x1b[32m✓ Saved ${cookieKey} to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
  }

  if (isTm) {
    return {
      async getSession() {
        return { cookie: cookie.trim() };
      }
    };
  } else {
    return new CookieAuthProvider(cookie.trim());
  }
}

/** Silent browser-login auth provider used in non-interactive mode. */
function makeSilentBrowserAuthProvider(adapter: any): any {
  const isTm = adapter.id === "tm";
  const localeKey = isTm ? "TM_LOCALE" : "MC_LOCALE";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";
  const loginKey = isTm ? "TM_LOGIN" : "MC_LOGIN";
  const pwKey = isTm ? "TM_PW" : "MC_PW";

  return {
    async getSession() {
      const locale = (process.env[localeKey] ?? "de-DE") as any;
      console.error(`No ${adapter.deviceName} cookie found. Opening login window...`);
      const result = await adapter.browserLogin({
        locale,
        credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
        onStatus: (message: string) => console.error(message)
      });
      upsertDotEnvValue(GLOBAL_ENV_PATH, cookieKey, result.cookie);
      console.error(`Saved ${cookieKey} to ${GLOBAL_ENV_PATH}.`);
      return { cookie: result.cookie, source: result.source };
    }
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ─── Other commands ───────────────────────────────────────────────────────────

program
  .command("login-browser")
  .description("Open an app-style browser login window and capture the Cookie header.")
  .option("--device <device>", "Target device: 'mc' or 'tm'", getTargetDevice("mc"))
  .option("--save", "Write the captured cookie to configuration file in ~/.smart-recipe")
  .option("--no-print", "Do not print the captured cookie JSON")
  .option("--email <email>", "Email to pre-fill in the browser")
  .option("--password <password>", "Password to auto-submit in the browser")
  .option("--timeout <seconds>", "Seconds to wait for login to complete", "300")
  .option("--profile-dir <path>", "Playwright browser profile directory")
  .option("--start-url <url>", "URL to open in the login window")
  .option("--keep-open", "Leave the browser window open after capturing cookies")
  .option("--no-install-browser", "Do not automatically download Playwright Chromium if it is missing")
  .action(async (options) => {
    const adapter = getDeviceAdapter(options.device);
    const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const localeKey = adapter.id === "tm" ? "TM_LOCALE" : "MC_LOCALE";
    const loginKey = adapter.id === "tm" ? "TM_LOGIN" : "MC_LOGIN";
    const pwKey = adapter.id === "tm" ? "TM_PW" : "MC_PW";

    const locale = (process.env[localeKey] ?? "de-DE") as any;
    const credentials = (options.email || process.env[loginKey]) ? {
      email: options.email ?? process.env[loginKey]!,
      password: options.password ?? process.env[pwKey]
    } : undefined;

    const result = await adapter.browserLogin({
      locale,
      userDataDir: options.profileDir,
      startUrl: options.startUrl,
      timeoutMs: Number(options.timeout) * 1000,
      keepOpen: options.keepOpen,
      installBrowsers: options.installBrowser,
      credentials,
      onStatus: (message: string) => console.error(message)
    } as any);

    if (options.save) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, cookieKey, result.cookie);
      console.error(`Saved ${cookieKey} to ${GLOBAL_ENV_PATH}.`);
    }

    if (options.print !== false) {
      printOutput({
        source: result.source,
        cookie: result.cookie,
        cookieNames: result.cookieNames,
        saved: Boolean(options.save)
      }, program.optsWithGlobals().json, (v) => `\nCaptured cookie from ${v.source}. Saved to config: ${v.saved}`);
    }
  });

program
  .command("retrieve")
  .description("Fetch a recipe page and print converted Markdown plus selected image candidates.")
  .argument("<url>", "Recipe URL")
  .option("--no-images", "Do not download image bytes")
  .action(async (url, options) => {
    const page = await retrieveRecipePage(url, { includeImageBytes: options.images });
    printOutput({
      url: page.finalUrl,
      title: page.title,
      markdown: page.markdown,
      images: page.images.map(({ bytes, dataUrl, ...image }) => image)
    }, program.optsWithGlobals().json, (v) => {
      const parts = [`\n# ${v.title}`, `URL: ${v.url}`, `\n## Markdown Extract\n\n${marked.parse(v.markdown)}`];
      if (v.images && v.images.length > 0) {
        parts.push(`\n## Images\n`);
        v.images.forEach((img: any, i: number) => {
          parts.push(`  [${i + 1}] ${img.url} (Score: ${img.score})`);
          if (img.reason) parts.push(`      Reason: ${img.reason}`);
        });
      }
      return parts.join("\n");
    });
  });

program
  .command("validate")
  .description("Validate a generated Smart recipe input JSON file.")
  .argument("<file>", "JSON file")
  .option("--device <device>", "Force validate against a specific device ('mc' or 'tm')")
  .action(async (file, options) => {
    const value = JSON.parse(await readFile(file, "utf8"));
    const deviceId = options.device || detectDeviceFromRecipe(value);
    const adapter = getDeviceAdapter(deviceId);
    const validation = adapter.validateInput(value);
    printOutput(validation, program.optsWithGlobals().json);
    if (validation.ok && !program.optsWithGlobals().json) {
      console.log(adapter.formatInputForTerminal(value));
    }
  });

program
  .command("schema")
  .description("Print the model-facing JSON schema.")
  .option("--device <device>", "Print schema for a specific device ('mc' or 'tm')", getTargetDevice("mc"))
  .action((options) => {
    const adapter = getDeviceAdapter(options.device);
    printOutput(adapter.getSchema(), program.optsWithGlobals().json);
  });

program
  .command("prompt")
  .description("Print the prompt/schema hints used for generation.")
  .option("--device <device>", "Print prompt for a specific device ('mc' or 'tm')", getTargetDevice("mc"))
  .option("--locale <locale>", "Locale for prompt hints", "de-DE")
  .option("--tm-version <version>", "Thermomix version ('tm5', 'tm6', or 'tm7')", "tm6")
  .option("--exclude-modes <modes>", "Comma-separated list of Smart modes to exclude")
  .option("--mc-food-processor <boolean>", "Whether you own the Monsieur Cuisine food processor attachment (true/false)")
  .action((options) => {
    if (options.mcFoodProcessor) {
      process.env.MC_HAS_FOOD_PROCESSOR = options.mcFoodProcessor.toLowerCase();
    }
    const excludeModes = options.excludeModes
      ? options.excludeModes.split(",").map((m: string) => m.trim())
      : [];
    if (options.device === "mc" && !mcHasFoodProcessor()) {
      if (!excludeModes.includes("foodProcessor")) {
        excludeModes.push("foodProcessor");
      }
    }
    const adapter = getDeviceAdapter(options.device);
    const promptOpts = options.device === "tm" ? {
      tmVersion: options.tmVersion,
      excludeModes: excludeModes.length > 0 ? excludeModes : undefined
    } : {
      excludeModes: excludeModes.length > 0 ? excludeModes : undefined
    };
    console.log(adapter.getPromptInstructions(options.locale, promptOpts));
  });

program
  .command("catalog")
  .description("Show verified and planned locale/catalog data.")
  .action(() => {
    printOutput({
      supportedLocales,
      plannedLocales,
      categoriesByLocale: Object.fromEntries(supportedLocales.map((locale) => [locale, categoryPromptText(locale)]))
    }, program.optsWithGlobals().json);
  });

program
  .command("me")
  .description("Check the current session.")
  .option("--device <device>", "Target device: 'mc' or 'tm'", getTargetDevice("mc"))
  .option("--cookie <cookie>", "Cookie header")
  .action(async (options) => {
    const adapter = getDeviceAdapter(options.device);
    const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const activeCookie = options.cookie ?? process.env[cookieKey];

    if (!activeCookie) {
      throw new Error(`No ${adapter.deviceName} cookie found. Use login-browser command first.`);
    }

    printOutput(await adapter.getCurrentUser(activeCookie), program.optsWithGlobals().json);
  });

program
  .command("drafts")
  .description("List draft recipes visible to the current session.")
  .option("--device <device>", "Target device: 'mc' or 'tm'", getTargetDevice("mc"))
  .option("--cookie <cookie>", "Cookie header")
  .option("--size <size>", "Number of drafts to fetch", "20")
  .action(async (options) => {
    const adapter = getDeviceAdapter(options.device);
    const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const activeCookie = options.cookie ?? process.env[cookieKey];

    if (!activeCookie) {
      throw new Error(`No ${adapter.deviceName} cookie found. Use login-browser command first.`);
    }

    const result = await adapter.listDrafts({ cookie: activeCookie, size: Number(options.size) }) as any;
    
    let recipes: any[] = [];
    let total = 0;
    let totalPage = 1;

    if (adapter.id === "tm") {
      recipes = result?.data?.recipes ?? [];
      total = result?.data?.total ?? 0;
      totalPage = result?.data?.totalPage ?? 1;
    } else {
      recipes = (result?.data?.recipes ?? []).map((recipe: any) => ({
        id: recipe.id,
        title: recipe.title,
        status: recipe.status,
        updatedAt: recipe.updatedAt,
        deviceTypes: recipe.deviceTypes
      }));
      total = result?.data?.total ?? 0;
      totalPage = result?.data?.totalPage ?? 1;
    }

    const formattedRecipes = recipes.map((recipe: any) => {
      let recipeUrl = recipe.recipeUrl;
      if (!recipeUrl && recipe.id) {
        if (adapter.id === "tm") {
          const localeKey = "TM_LOCALE";
          const locale = (process.env[localeKey] ?? "de-DE") as any;
          const loc = getLocalization(locale);
          recipeUrl = `https://${loc.domain}/created-recipes/${loc.language}/${recipe.id}`;
        } else {
          recipeUrl = `https://www.monsieur-cuisine.com/connect-recipes?recipe-id=${recipe.id}`;
        }
      }
      return {
        id: recipe.id,
        title: recipe.title,
        status: recipe.status,
        updatedAt: recipe.updatedAt,
        deviceTypes: recipe.deviceTypes,
        recipeUrl
      };
    });

    printOutput({
      total,
      totalPage,
      recipes: formattedRecipes
    }, program.optsWithGlobals().json);
  });

program
  .command("get-recipe")
  .description("Fetch raw JSON of a single Cookidoo recipe by ID (useful for debugging API field constraints).")
  .argument("<id>", "Recipe ID (e.g. 01KB04WSJP4SHNBKJK4H4FT0PZ)")
  .option("--device <device>", "Target device: 'mc' or 'tm'", getTargetDevice("tm"))
  .option("--cookie <cookie>", "Cookie header")
  .option("--public", "Fetch from the public created-recipes endpoint instead of own")
  .action(async (id, options) => {
    const cookieKey = options.device === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const activeCookie = options.cookie ?? process.env[cookieKey];
    if (!activeCookie) {
      throw new Error(`No ${options.device === "tm" ? "Thermomix" : "Monsieur Cuisine"} cookie found. Use login-browser command first.`);
    }
    const locale = (process.env.TM_LOCALE ?? "de-DE") as string;
    const client = new (await import("../devices/tm/client.js")).CookidooClient({ cookie: activeCookie, locale });
    const path = options.public
      ? `/created-recipes/public/recipes/${client.language}/${encodeURIComponent(id)}`
      : `/created-recipes/${client.language}/${encodeURIComponent(id)}`;
    const result = await client.request<any>({ method: "GET", path });
    printOutput(result, program.optsWithGlobals().json);
  });

program.parseAsync().catch((error) => {
  if (error instanceof MonsieurCuisineApiError) {
    console.error(formatMonsieurCuisineApiError(error));
  } else if (error instanceof AuthFlowError) {
    console.error(formatAuthFlowError(error));
  } else if (error instanceof CookidooError) {
    console.error(formatCookidooError(error));
  } else {
    console.error(error.stack || error.message || String(error));
  }
  process.exitCode = 1;
});

// ─── Output helpers ───────────────────────────────────────────────────────────

function printOutput(value: any, isJson: boolean, customFormat?: (val: any) => string): void {
  if (isJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (customFormat) {
    console.log(customFormat(value));
  } else {
    console.dir(value, { depth: null, colors: true });
  }
}

function summarizeImportResult(result: Awaited<ReturnType<typeof importRecipeFromUrl>>) {
  const draft =
    typeof result.draft === "object" && result.draft
      ? result.draft as { id?: unknown; title?: unknown; status?: unknown }
      : undefined;

  if (draft) {
    return {
      id: draft.id,
      title: draft.title ?? result.recipeInput.title,
      status: draft.status,
      recipeUrl: result.recipeUrl,
      image: result.uploadedImage,
      imageSource: result.recipeImage?.source
    };
  }

  return {
    title: result.recipeInput.title,
    recipeInput: result.recipeInput,
    payload: result.payload
  };
}

function printableImportResult(result: Awaited<ReturnType<typeof importRecipeFromUrl>>) {
  return {
    page: {
      url: result.page.url,
      finalUrl: result.page.finalUrl,
      title: result.page.title,
      markdownChars: result.page.markdown.length,
      images: result.page.images.map((image) => ({
        url: image.url,
        contentType: image.contentType,
        score: image.score,
        reason: image.reason,
        bytes: image.bytes?.byteLength ?? 0
      }))
    },
    recipeInput: result.recipeInput,
    payload: result.payload,
    recipeImage: result.recipeImage,
    uploadedImage: result.uploadedImage,
    draft: result.draft,
    recipeUrl: result.recipeUrl
  };
}

function formatMonsieurCuisineApiError(error: MonsieurCuisineApiError): string {
  return [
    `${error.name}: ${error.message}`,
    error.status === undefined ? undefined : `Status: ${error.status}`,
    error.code === undefined ? undefined : `Code: ${error.code}`,
    error.endpoint === undefined ? undefined : `Endpoint: ${error.endpoint}`,
    error.response === undefined ? undefined : "Response:",
    error.response === undefined ? undefined : JSON.stringify(error.response, null, 2)
  ]
    .filter(Boolean)
    .join("\n");
}

function formatAuthFlowError(error: AuthFlowError): string {
  return [
    `${error.name}: ${error.message}`,
    `Code: ${error.code}`,
    error.response === undefined ? undefined : "Response:",
    error.response === undefined ? undefined : JSON.stringify(error.response, null, 2)
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCookidooError(error: CookidooError): string {
  return [
    `${error.name}: ${error.message}`,
    error.status === undefined ? undefined : `Status: ${error.status}`,
    error.method === undefined ? undefined : `Method: ${error.method}`,
    error.url === undefined ? undefined : `URL: ${error.url}`,
    error.body === undefined ? undefined : "Body:",
    error.body === undefined ? undefined : JSON.stringify(error.body, null, 2)
  ]
    .filter(Boolean)
    .join("\n");
}

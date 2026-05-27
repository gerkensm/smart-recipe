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
import { loadDotEnv, upsertDotEnvValue } from "../config/env.js";
import { categoryPromptText, plannedLocales, supportedLocales } from "../catalogs/index.js";
import { buildRecipeInstructions } from "../llm/prompts.js";
import { BrowserCookieAuthProvider, CookieAuthProvider } from "../mc/auth.js";
import { browserLoginForMonsieurCuisine } from "../mc/browser-login.js";
import { AuthFlowError, MonsieurCuisineApiError } from "../mc/errors.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
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
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

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
    .option("--dry-run", "Skip upload to Monsieur Cuisine (overrides --yes)")
    .option("--yes", "Always upload without asking for confirmation")
    .option("--full-response", "Print the full result object")
    .option("--no-print-markdown", "Do not pretty-print the retrieved markdown to the console")
    .option("--model <model>", "OpenAI model", process.env.OPENAI_MODEL ?? "gpt-5.5")
    .option("--reasoning <effort>", "OpenAI reasoning effort: minimal, low, medium, high", process.env.OPENAI_REASONING_EFFORT ?? "medium")
    .option("--recreate-image", "Generate a new recipe image with OpenAI instead of uploading the source image")
    .option("--recreate-image-with-source-images", "When recreating the image, send downloaded website images as loose visual context")
    .option("--image-model <model>", "OpenAI image model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2")
    .option("--image-size <size>", "Generated image size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1024")
    .option("--image-quality <quality>", "Generated image quality: low, medium, high, auto", process.env.OPENAI_IMAGE_QUALITY ?? "medium")
    .option("--cookie <cookie>", "Monsieur Cuisine/Lidl Plus browser Cookie header")
    .option("--exclude-modes <modes>", "Comma-separated list of Smart modes to exclude (e.g. foodProcessor)");
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
  const shouldRecreateImage = options.recreateImage || options.recreateImageWithSourceImages;
  const imageProvider = shouldRecreateImage
    ? new OpenAIRecipeImageGenerator({
      model: options.imageModel,
      size: options.imageSize,
      quality: options.imageQuality,
      includeSourceImages: Boolean(options.recreateImageWithSourceImages),
      logger
    })
    : undefined;

  const generated: GenerateSmartRecipeResult = await generateSmartRecipe({
    page,
    openAIModel: options.model,
    reasoningEffort: options.reasoning as ReasoningEffort,
    excludeModes: options.excludeModes ? options.excludeModes.split(",").map((m: string) => m.trim()) : undefined,
    logger
  });

  // ── Step 3: Display the recipe ────────────────────────────────────────────
  if (!isJsonMode) {
    console.log(formatRecipeTerminal(generated.recipeInput));
  }

  // ── Step 4: Decide whether to upload ─────────────────────────────────────
  // Precedence: --dry-run beats --yes beats interactive prompt.
  let shouldUpload: boolean;
  if (options.dryRun) {
    shouldUpload = false;
  } else if (options.yes) {
    shouldUpload = true;
  } else if (isInteractive) {
    console.log();
    shouldUpload = await confirm({
      message: "  Upload this recipe to Monsieur Cuisine?",
      default: false
    });
  } else {
    // Non-interactive and no explicit flag: safe default is dry-run.
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

  // ── Step 5: Resolve authentication ───────────────────────────────────────
  let authProvider = await resolveAuthInteractively(options, isInteractive);

  // ── Step 6: Upload ────────────────────────────────────────────────────────
  let uploadResult;
  try {
    uploadResult = await uploadSmartRecipe({
      page: generated.page,
      recipeInput: generated.recipeInput,
      cookie: options.cookie ?? process.env.MC_COOKIE,
      authProvider,
      imageProvider,
      logger
    });
  } catch (error) {
    const isExpiredToken =
      error instanceof MonsieurCuisineApiError &&
      (error.status === 401 ||
        error.code === 110002 ||
        (error.response &&
          typeof error.response === "object" &&
          (error.response as any).message === "ExpiredAuthCookieException"));

    if (isInteractive && isExpiredToken) {
      console.log("\n  \x1b[31m✗ Monsieur Cuisine session has expired or is invalid.\x1b[0m");
      console.log("  Please authenticate to obtain a new session.");

      // Clear current expired session cookies to force fresh interactive auth
      delete process.env.MC_COOKIE;
      const oldOptionsCookie = options.cookie;
      options.cookie = undefined;

      // Ask for credentials / cookie again
      authProvider = await resolveAuthInteractively(options, isInteractive);

      // Attempt upload again with the new session
      const session = await authProvider.getSession();
      const newCookie = session.cookie;
      process.env.MC_COOKIE = newCookie;

      logger.info("retrying Monsieur Cuisine upload with new session");
      uploadResult = await uploadSmartRecipe({
        page: generated.page,
        recipeInput: generated.recipeInput,
        cookie: newCookie,
        authProvider,
        imageProvider,
        logger
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
      if (v.image) parts.push(`  Image Media ID: ${v.image.detailsMediaId}`);
      if (v.imageSource) parts.push(`  Image Source: ${v.imageSource}`);
      return parts.join("\n");
    }
  );
}

/**
 * Resolves a Monsieur Cuisine auth provider interactively.
 *
 * Priority:
 *   1. --cookie flag or MC_COOKIE env var → use immediately
 *   2. Interactive: offer browser login or manual cookie paste
 *   3. Non-interactive fallback: attempt browser login silently
 *
 * After a successful interactive session, offers to save the cookie.
 */
async function resolveAuthInteractively(
  options: { cookie?: string },
  isInteractive: boolean
): Promise<import("../mc/auth.js").AuthProvider> {
  // Already have a cookie → no prompts needed.
  if (options.cookie || process.env.MC_COOKIE) {
    return new CookieAuthProvider(options.cookie ?? process.env.MC_COOKIE ?? "");
  }

  if (!isInteractive) {
    // Non-interactive: fall back to silent browser login (old default behaviour).
    return makeSilentBrowserAuthProvider();
  }

  // Interactive: let the user choose.
  console.log();
  console.log("  \x1b[1m\x1b[33m⚠  No Monsieur Cuisine session found.\x1b[0m");
  console.log();

  const method = await select({
    message: "  How would you like to authenticate?",
    choices: [
      {
        name: "Browser login  (opens Lidl Plus login window)",
        value: "browser" as const,
        description: "A small Chromium window opens so you can\nsign in with your Lidl Plus account."
      },
      {
        name: "Paste cookie   (enter Cookie header manually)",
        value: "cookie" as const,
        description: "Open monsieur-cuisine.com in your browser,\ncopy the Cookie header from DevTools, and\npaste it here."
      }
    ]
  });

  if (method === "browser") {
    try {
      return await attemptBrowserLogin(isInteractive);
    } catch (err) {
      // Browser login failed → fall back to cookie paste.
      console.log();
      console.log("  \x1b[31m✗ Browser login failed.\x1b[0m Falling back to manual cookie.");
      return await promptForManualCookie();
    }
  }

  return await promptForManualCookie();
}

/** Attempts a browser login, saves the cookie if the user agrees, and returns a CookieAuthProvider. */
async function attemptBrowserLogin(isInteractive: boolean): Promise<import("../mc/auth.js").AuthProvider> {
  const locale = (process.env.MC_LOCALE ?? "de-DE") as any;
  console.log();
  const result = await browserLoginForMonsieurCuisine({
    locale,
    credentials: process.env.MC_LOGIN ? { email: process.env.MC_LOGIN, password: process.env.MC_PW } : undefined,
    onStatus: (message) => console.error(`  \x1b[2m${message}\x1b[0m`)
  });

  if (isInteractive) {
    console.log();
    const saveCookie = await confirm({
      message: "  Save this session cookie to ~/.smart-recipe?",
      default: true
    });
    if (saveCookie) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_COOKIE", result.cookie);
      console.log(`  \x1b[32m✓ Saved MC_COOKIE to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
    }
  }

  return new CookieAuthProvider(result.cookie);
}

/**
 * Shows step-by-step instructions for obtaining a cookie manually,
 * then prompts the user to paste it in and offers to save it.
 */
async function promptForManualCookie(): Promise<import("../mc/auth.js").AuthProvider> {
  console.log();
  console.log("  \x1b[1mHow to get your Cookie header:\x1b[0m");
  console.log("  1. Open \x1b[36mhttps://www.monsieur-cuisine.com\x1b[0m and log in with your Lidl Plus account.");
  console.log("  2. Open DevTools  \x1b[2m(F12 or Cmd+Option+I)\x1b[0m → Network tab.");
  console.log("  3. Reload the page, click any request to monsieur-cuisine.com.");
  console.log("  4. In the Request Headers, find \x1b[1mCookie:\x1b[0m and copy the full value.");
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
    upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_COOKIE", cookie.trim());
    console.log(`  \x1b[32m✓ Saved MC_COOKIE to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
  }

  return new CookieAuthProvider(cookie.trim());
}

/** Silent browser-login auth provider used in non-interactive mode (old default). */
function makeSilentBrowserAuthProvider(): import("../mc/auth.js").AuthProvider {
  return {
    async getSession() {
      const locale = (process.env.MC_LOCALE ?? "de-DE") as any;
      console.error("No Monsieur Cuisine cookie found. Opening login window...");
      const result = await browserLoginForMonsieurCuisine({
        locale,
        credentials: process.env.MC_LOGIN ? { email: process.env.MC_LOGIN, password: process.env.MC_PW } : undefined,
        onStatus: (message) => console.error(message)
      });
      upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_COOKIE", result.cookie);
      console.error(`Saved MC_COOKIE to ${GLOBAL_ENV_PATH}.`);
      return { cookie: result.cookie, source: "lidl-browser" as const };
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
  .description("Open an app-style browser login window and capture the Monsieur Cuisine Cookie header.")
  .option("--save", "Write the captured cookie to MC_COOKIE in ~/.smart-recipe")
  .option("--no-print", "Do not print the captured cookie JSON")
  .option("--email <email>", "Lidl Plus email to pre-fill in the browser")
  .option("--password <password>", "Lidl Plus password to auto-submit in the browser")
  .option("--timeout <seconds>", "Seconds to wait for login to complete", "300")
  .option("--profile-dir <path>", "Playwright browser profile directory")
  .option("--start-url <url>", "URL to open in the login window")
  .option("--keep-open", "Leave the browser window open after capturing cookies")
  .option("--no-install-browser", "Do not automatically download Playwright Chromium if it is missing")
  .action(async (options) => {
    const envPath = program.optsWithGlobals().env;
    const locale = (process.env.MC_LOCALE ?? "de-DE") as any;
    const result = await browserLoginForMonsieurCuisine({
      locale,
      userDataDir: options.profileDir,
      startUrl: options.startUrl,
      timeoutMs: Number(options.timeout) * 1000,
      keepOpen: options.keepOpen,
      installBrowsers: options.installBrowser,
      credentials: (options.email || process.env.MC_LOGIN) ? {
        email: options.email ?? process.env.MC_LOGIN,
        password: options.password ?? process.env.MC_PW
      } : undefined,
      onStatus: (message) => console.error(message)
    });

    if (options.save) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_COOKIE", result.cookie);
      console.error(`Saved MC_COOKIE to ${GLOBAL_ENV_PATH}.`);
    }

    if (options.print) {
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
  .action(async (file) => {
    const value = JSON.parse(await readFile(file, "utf8"));
    const validation = validateRecipeInput(value);
    printOutput(validation, program.optsWithGlobals().json);
    if (validation.ok && !program.optsWithGlobals().json) {
      console.log(formatRecipeTerminal(value));
    }
  });

program
  .command("schema")
  .description("Print the model-facing JSON schema.")
  .action(() => {
    printOutput(RecipeInputSchema, program.optsWithGlobals().json);
  });

program
  .command("prompt")
  .description("Print the prompt/schema hints used for generation.")
  .action(() => {
    console.log(buildRecipeInstructions("de-DE"));
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
  .description("Check the current Monsieur Cuisine session.")
  .option("--cookie <cookie>", "Cookie header")
  .action(async (options) => {
    const authProvider = options.cookie || process.env.MC_COOKIE
      ? new CookieAuthProvider(options.cookie ?? process.env.MC_COOKIE ?? "")
      : makeSilentBrowserAuthProvider();
    const client = new MonsieurCuisineSmartClient({
      cookie: options.cookie ?? process.env.MC_COOKIE,
      authProvider
    });
    printOutput(await client.getCurrentUser(), program.optsWithGlobals().json);
  });

program
  .command("drafts")
  .description("List Monsieur Cuisine Smart draft recipes visible to the current session.")
  .option("--cookie <cookie>", "Cookie header")
  .option("--size <size>", "Number of drafts to fetch", "20")
  .action(async (options) => {
    const authProvider = options.cookie || process.env.MC_COOKIE
      ? new CookieAuthProvider(options.cookie ?? process.env.MC_COOKIE ?? "")
      : makeSilentBrowserAuthProvider();
    const client = new MonsieurCuisineSmartClient({
      cookie: options.cookie ?? process.env.MC_COOKIE,
      authProvider
    });
    const result = await client.listDrafts({ size: Number(options.size) }) as any;
    const recipes = result?.data?.recipes ?? [];
    printOutput({
      total: result?.data?.total,
      totalPage: result?.data?.totalPage,
      recipes: recipes.map((recipe: any) => ({
        id: recipe.id,
        title: recipe.title,
        status: recipe.status,
        updatedAt: recipe.updatedAt,
        deviceTypes: recipe.deviceTypes,
        recipeUrl: recipe.id ? client.recipeUrl(recipe.id, recipe.languageLocale ?? "de-DE") : undefined
      }))
    }, program.optsWithGlobals().json);
  });

program.parseAsync().catch((error) => {
  if (error instanceof MonsieurCuisineApiError) {
    console.error(formatMonsieurCuisineApiError(error));
  } else if (error instanceof AuthFlowError) {
    console.error(formatAuthFlowError(error));
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

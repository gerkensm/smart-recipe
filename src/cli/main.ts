#!/usr/bin/env node
import process from "node:process";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { input } from "@inquirer/prompts";
import { loadDotEnv, upsertDotEnvValue } from "../config/env.js";
import { categoryPromptText, plannedLocales, supportedLocales } from "../catalogs/index.js";
import { buildRecipeInstructions } from "../llm/prompts.js";
import { BrowserCookieAuthProvider, CookieAuthProvider } from "../mc/auth.js";
import { browserLoginForMonsieurCuisine } from "../mc/browser-login.js";
import { AuthFlowError, MonsieurCuisineApiError } from "../mc/errors.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
import { importRecipeFromUrl } from "../pipeline/import-url.js";
import { RecipeInputSchema } from "../recipes/schema.js";
import { validateRecipeInput } from "../recipes/validation.js";
import { retrieveRecipePage } from "../retriever/retriever.js";
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

program
  .command("import-url")
  .description("Retrieve a recipe page, generate Smart recipe JSON with OpenAI, and optionally upload a draft.")
  .argument("<url>", "Recipe URL")
  .option("--dry-run", "Do not upload to Monsieur Cuisine")
  .option("--full-response", "Print the full result object")
  .option("--model <model>", "OpenAI model", process.env.OPENAI_MODEL ?? "gpt-5.5")
  .option("--reasoning <effort>", "OpenAI reasoning effort: minimal, low, medium, high", process.env.OPENAI_REASONING_EFFORT ?? "medium")
  .option("--recreate-image", "Generate a new recipe image with OpenAI instead of uploading the source image")
  .option("--recreate-image-with-source-images", "When recreating the image, send downloaded website images as loose visual context")
  .option("--image-model <model>", "OpenAI image model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2")
  .option("--image-size <size>", "Generated image size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1024")
  .option("--image-quality <quality>", "Generated image quality: low, medium, high, auto", process.env.OPENAI_IMAGE_QUALITY ?? "medium")
  .option("--cookie <cookie>", "Monsieur Cuisine/Lidl Plus browser Cookie header")
  .option("--prompt-cookie", "Ask for a browser Cookie header if MC_COOKIE is not set")

  .action(async (url, options) => {
    const logger = createLogger({
      level: program.optsWithGlobals().logLevel,
      pretty: !program.optsWithGlobals().jsonLogs,
      destination: 2
    });
    const authProvider = await authProviderFromOptions(options);
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
    const result = await importRecipeFromUrl({
      url,
      dryRun: options.dryRun,
      fullResponse: options.fullResponse,
      openAIModel: options.model,
      reasoningEffort: options.reasoning as ReasoningEffort,
      cookie: options.cookie ?? process.env.MC_COOKIE,
      authProvider,
      imageProvider,
      logger
    });
    printOutput(options.fullResponse ? printableImportResult(result) : summarizeImportResult(result), (v) => {
      if (options.fullResponse) return JSON.stringify(v, null, 2);
      const parts = [`\n=== Recipe Import Successful ===`, `Title: ${v.title}`];
      if (v.recipeUrl) parts.push(`URL: ${v.recipeUrl}`);
      if (v.id) parts.push(`Draft ID: ${v.id} (${v.status})`);
      if (v.image) parts.push(`Uploaded Image Media ID: ${v.image.detailsMediaId}`);
      if (v.imageSource) parts.push(`Image Source: ${v.imageSource}`);
      return parts.join("\n");
    });
  });

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
      }, (v) => `\nCaptured cookie from ${v.source}. Saved to config: ${v.saved}`);
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
    }, (v) => {
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
    printOutput(validateRecipeInput(value));
  });

program
  .command("schema")
  .description("Print the model-facing JSON schema.")
  .action(() => {
    printOutput(RecipeInputSchema);
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
    });
  });

program
  .command("me")
  .description("Check the current Monsieur Cuisine session.")
  .option("--cookie <cookie>", "Cookie header")
  .option("--prompt-cookie", "Ask for a browser Cookie header if MC_COOKIE is not set")
  .action(async (options) => {
    const authProvider = await authProviderFromOptions(options);
    const client = new MonsieurCuisineSmartClient({
      cookie: options.cookie ?? process.env.MC_COOKIE,
      authProvider
    });
    printOutput(await client.getCurrentUser());
  });

program
  .command("drafts")
  .description("List Monsieur Cuisine Smart draft recipes visible to the current session.")
  .option("--cookie <cookie>", "Cookie header")
  .option("--prompt-cookie", "Ask for a browser Cookie header if MC_COOKIE is not set")
  .option("--size <size>", "Number of drafts to fetch", "20")
  .action(async (options) => {
    const authProvider = await authProviderFromOptions(options);
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
    });
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

async function authProviderFromOptions(options: { promptCookie?: boolean; cookie?: string }) {
  if (options.cookie || process.env.MC_COOKIE) {
    return new CookieAuthProvider(options.cookie ?? process.env.MC_COOKIE ?? "");
  }

  if (options.promptCookie) {
    return new BrowserCookieAuthProvider(() => input({ message: "Paste browser Cookie header" }));
  }

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

function printOutput(value: any, customFormat?: (val: any) => string): void {
  if (program.optsWithGlobals().json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  
  if (customFormat) {
    console.log(customFormat(value));
  } else {
    console.dir(value, { depth: null, colors: true });
  }
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

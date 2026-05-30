#!/usr/bin/env node
import process from "node:process";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Command, Help } from "commander";
import fs from "node:fs";
import { loadDotEnv, upsertDotEnvValue, getTmVersion, getTmLocale, mcHasFoodProcessor } from "../config/env.js";
import { categoryPromptText, plannedLocales, supportedLocales } from "../catalogs/index.js";
import { MonsieurCuisineApiError } from "../mc/errors.js";
import { CookidooError } from "../devices/tm/errors.js";
import { getDeviceAdapter } from "../devices/index.js";
import {
  generateSmartRecipe,
  uploadSmartRecipe,
  type GenerateSmartRecipeResult
} from "../pipeline/import-url.js";
import { retrieveRecipePage } from "../retriever/retriever.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import { createLogger } from "../logging/logger.js";
import type { ReasoningEffort } from "../llm/types.js";
export {
  cleanHtmlText,
  parseIsoDuration,
  mapOfficialCookidooToInput,
  mapCustomCookidooToInput,
} from "./cookidoo-mappers.js";
export { mapMonsieurCuisineToInput } from "./monsieur-cuisine-mappers.js";
import { mapRecipeToInput, formatRecipeForTerminal } from "./recipe-rendering.js";
export { formatRecipeForTerminal } from "./recipe-rendering.js";
import {
  formatDoctorForTerminal,
  formatRecipesForTerminal,
  formatUserForTerminal
} from "./formatters.js";
export { formatDraftsForTerminal, formatUserForTerminal } from "./formatters.js";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { detectRecipeSource, fetchRecipeSourceAsPage, fetchRecipeSourceWithRaw, type RecipeSource } from "../sources/index.js";
import { confirm, input, password as passwordPrompt } from "./prompts.js";
import { resolveAuthInteractively } from "./auth-workflow.js";
import { blankLine, colorDim, printError, printHeading, printStatus, printSuccess } from "./terminal.js";
import {
  decideUpload,
  ensureOpenAIKey,
  explicitImageMode,
  resolveExcludedModes,
  resolveImageProvider,
  resolveTargetDeviceSettings
} from "./import-workflow.js";
import {
  activeCookieForDevice,
  cookieKeyForDevice,
  getOrPromptDevice,
  getOrPromptTargetLocale,
  sourceCookiesFromOptions,
  sourceDeviceForType,
  sourceLocaleFromOptions
} from "./settings.js";
import {
  formatCliError,
  printableImportResult,
  printOutput,
  printSuggestedCommand,
  summarizeImportResult
} from "./output.js";

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

const optionCategories: Record<string, string> = {
  "--env": "Global Settings",
  "--log-level": "Global Settings",
  "--json": "Global Settings",
  "--json-logs": "Global Settings",
  "--no-save-settings": "Global Settings",
  "--always-upload": "General / Import Workflow Options",
  "--dry-run": "General / Import Workflow Options",
  "--full-response": "General / Import Workflow Options",
  "--no-print-markdown": "General / Import Workflow Options",
  "--device": "Device & Target Settings",
  "--locale": "Device & Target Settings",
  "--language": "Device & Target Settings",
  "--source-locale": "Device & Target Settings",
  "--tm-version": "Device & Target Settings",
  "--mc-food-processor": "Device & Target Settings",
  "--exclude-modes": "Device & Target Settings",
  "--extend-tm-modes": "Device & Target Settings",
  "--experimental-tm-modes": "Device & Target Settings",
  "--model": "AI Generation & Reasoning",
  "--reasoning": "AI Generation & Reasoning",
  "--no-image": "Recipe Image Settings",
  "--use-source-image": "Recipe Image Settings",
  "--recreate-image": "Recipe Image Settings",
  "--recreate-image-with-source-images": "Recipe Image Settings",
  "--image-model": "Recipe Image Settings",
  "--image-size": "Recipe Image Settings",
  "--image-quality": "Recipe Image Settings",
  "--cookie": "Authentication & Cookies Settings",
  "--check-auth": "Authentication & Cookies Settings",
  "--no-check-auth": "Authentication & Cookies Settings",
  "--source-cookie": "Authentication & Cookies Settings",
  "--mc-source-cookie": "Authentication & Cookies Settings",
  "--tm-source-cookie": "Authentication & Cookies Settings",
  "--input": "Options",
  "--search": "Options",
  "--limit": "Options",
  "--source": "Options",
};

class GroupedHelp extends Help {
  formatHelp(cmd: Command, helper: Help): string {
    const parts: string[] = [];

    const description = helper.commandDescription(cmd);
    if (description) {
      parts.push(description);
      parts.push("");
    }

    const usage = helper.commandUsage(cmd);
    if (usage) {
      parts.push(`${helper.styleTitle("Usage:")} ${usage}`);
      parts.push("");
    }

    const visibleArguments = helper.visibleArguments(cmd);
    if (visibleArguments.length > 0) {
      parts.push(helper.styleTitle("Arguments:"));
      const termWidth = helper.longestArgumentTermLength(cmd, helper);
      const items = visibleArguments.map((arg) =>
        helper.formatItem(helper.argumentTerm(arg), termWidth, helper.argumentDescription(arg), helper)
      );
      parts.push(items.join("\n"));
      parts.push("");
    }

    const visibleCommands = helper.visibleCommands(cmd);
    if (visibleCommands.length > 0) {
      parts.push(helper.styleTitle("Commands:"));
      const termWidth = helper.longestSubcommandTermLength(cmd, helper);
      const items = visibleCommands.map((c) =>
        helper.formatItem(helper.subcommandTerm(c), termWidth, helper.subcommandDescription(c), helper)
      );
      parts.push(items.join("\n"));
      parts.push("");
    }

    const visibleOptions = helper.visibleOptions(cmd);
    if (visibleOptions.length > 0) {
      const categories: Record<string, any[]> = {};
      const order = [
        "Global Settings",
        "General / Import Workflow Options",
        "Device & Target Settings",
        "AI Generation & Reasoning",
        "Recipe Image Settings",
        "Authentication & Cookies Settings",
        "Options"
      ];

      for (const option of visibleOptions) {
        const flagName = option.long;
        let cat = "Options";
        if (flagName) {
          const matchedKey = Object.keys(optionCategories).find(k => flagName.startsWith(k));
          if (matchedKey) {
            cat = optionCategories[matchedKey];
          }
        }
        if (!categories[cat]) {
          categories[cat] = [];
        }
        categories[cat].push(option);
      }

      const termWidth = helper.longestOptionTermLength(cmd, helper);

      for (const catName of order) {
        const opts = categories[catName];
        if (opts && opts.length > 0) {
          parts.push(helper.styleTitle(`${catName}:`));
          const items = opts.map((opt) =>
            helper.formatItem(helper.optionTerm(opt), termWidth, helper.optionDescription(opt), helper)
          );
          parts.push(items.join("\n"));
          parts.push("");
        }
      }
    }

    return parts.join("\n");
  }
}

const program = new Command();
program.createCommand = (name) => {
  const cmd = new Command(name);
  cmd.createHelp = () => new GroupedHelp();
  return cmd;
};
program.createHelp = () => new GroupedHelp();
program
  .name("smart-recipe")
  .description("Generate, inspect, and upload smart-cooker recipes.")
  .option("--env <path>", "Load a specific env file instead of the default local .env")
  .option("--log-level <level>", "Log level", process.env.LOG_LEVEL ?? "info")
  .option("--json", "Output results as machine-readable JSON instead of human-readable text")
  .option("--json-logs", "Write machine-readable JSON logs instead of pretty text logs")
  .option("--no-save-settings", "Do not save selected cooker settings or API keys to ~/.smart-recipe configuration file")
  .hook("preAction", (command) => {
    const envPath = command.optsWithGlobals().env;
    if (envPath) loadDotEnv(envPath, { override: true });
    if (command.optsWithGlobals().saveSettings === false) {
      process.env.SAVE_SETTINGS = "false";
    }
  });

// ─── Shared import options helper ─────────────────────────────────────────────

function addImportOptions(cmd: Command): Command {
  return cmd
    .option("--dry-run", "Skip upload (overrides --always-upload)")
    .option("--always-upload", "Always upload without asking for confirmation")
    .option("--full-response", "Print the full result object")
    .option("--no-print-markdown", "Do not pretty-print the retrieved markdown to the console")
    .option("--model <model>", "OpenAI model", process.env.OPENAI_MODEL ?? "gpt-5.5")
    .option("--reasoning <effort>", "OpenAI reasoning effort: minimal, low, medium, high", process.env.OPENAI_REASONING_EFFORT ?? "medium")
    .option("--recreate-image", "Generate a new recipe image with OpenAI instead of uploading the source image")
    .option("--recreate-image-with-source-images", "When recreating the image, send downloaded website images as loose visual context")
    .option("--image-reference-source", "Alias for --recreate-image-with-source-images")
    .option("--no-image", "Skip image generation entirely; upload without an image (skips the image prompt)")
    .option("--use-source-image", "Use the best image from the source website directly (skips the image prompt)")
    .option("--image-model <model>", "OpenAI image model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2")
    .option("--image-size <size>", "Generated image size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1024")
    .option("--image-quality <quality>", "Generated image quality: low, medium, high, auto", process.env.OPENAI_IMAGE_QUALITY ?? "medium")
    .option("--cookie <cookie>", "Browser Cookie header")
    .option("--target <device>", "Alias for --device; target device: 'mc' or 'tm'")
    .option("--source <source>", "Source type hint: 'web', 'mc', 'cookidoo', or 'tm'")
    .option("--locale <locale>", `Target recipe locale/language (${supportedLocales.join(", ")}; two-letter aliases like de/en/fr are accepted)`)
    .option("--language <locale>", "Alias for --locale")
    .option("--source-locale <locale>", "Locale used for authenticated source APIs when the source URL/ID does not include one")
    .option("--source-cookie <cookie>", "Cookie header for authenticated source recipe ingestion")
    .option("--mc-source-cookie <cookie>", "Monsieur Cuisine source Cookie header")
    .option("--tm-source-cookie <cookie>", "Cookidoo/Thermomix source Cookie header")
    .option("--exclude-modes <modes>", "Comma-separated list of Smart modes to exclude (e.g. foodProcessor)")
    .option("--device <device>", "Target device: 'mc' or 'tm'")
    .option("--tm-version <version>", "Target Thermomix model: 'tm7', 'tm6', or 'tm5'")
    .option("--mc-food-processor <boolean>", "Whether you own the Monsieur Cuisine food processor attachment (true/false)")
    .option("--extend-tm-modes", "Enable TM modes not supported in My Creations (e.g. the cook/simmer mode). These will show as red in the Cookidoo editor.")
    .option("--experimental-tm-modes", "Alias for --extend-tm-modes.");
}

program
  .command("import-url")
  .alias("create")
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
  const source = detectRecipeSource(url, { source: options.source });
  const page = source.type === "web"
    ? await retrieveRecipePage(source.url, { includeImageBytes: true })
    : await fetchRecipeSourceAsPage(source, {
        cookies: sourceCookiesFromOptions(options, source),
        locale: sourceLocaleFromOptions(options, source),
        includeImageBytes: true,
      });
  if (!program.optsWithGlobals().json && options.printMarkdown !== false) {
    console.log(`\n=== Retrieved Markdown from URL ===\n`);
    console.log(marked.parse(page.markdown));
    console.log(`===================================\n`);
  }
  await runImport(page, options, program.optsWithGlobals(), ["import-url", url]);
});

program
  .command("import-file")
  .alias("create-file")
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
  await runImport(page, options, program.optsWithGlobals(), ["import-file", file]);
});

program
  .command("import-stdin")
  .alias("create-stdin")
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
  await runImport(page, options, program.optsWithGlobals(), ["import-stdin"]);
});

// ─── Interactive import wizard ────────────────────────────────────────────────

async function runImport(
  page: RetrievedRecipePage,
  options: any,
  programOpts: any,
  cmdArgs?: string[]
) {
  const isJsonMode = Boolean(programOpts.json);
  const isInteractive = !isJsonMode && process.stdout.isTTY && process.stdin.isTTY;
  let wasPrompted = false;

  const logger = createLogger({
    level: programOpts.logLevel,
    pretty: !programOpts.jsonLogs,
    destination: 2
  });

  if (options.mcFoodProcessor) {
    process.env.MC_HAS_FOOD_PROCESSOR = options.mcFoodProcessor.toLowerCase();
  }

  const targetDeviceResult = await resolveTargetDeviceSettings(options, isInteractive, GLOBAL_ENV_PATH);
  const targetDevice = targetDeviceResult.device;
  wasPrompted = wasPrompted || targetDeviceResult.prompted;
  const adapter = getDeviceAdapter(targetDevice);
  const targetLocaleResult = await getOrPromptTargetLocale(targetDevice, options, isInteractive, GLOBAL_ENV_PATH);
  const targetLocale = targetLocaleResult.locale;
  wasPrompted = wasPrompted || targetLocaleResult.prompted;

  await ensureOpenAIKey(isInteractive, GLOBAL_ENV_PATH);

  // ── Step 2: Generate the recipe ───────────────────────────────────────────
  // Image provider is resolved later (Step 4.5), after the user confirms upload.
  let imageMode = explicitImageMode(options);
  const excludeModes = resolveExcludedModes(targetDevice, options);

  const generated: GenerateSmartRecipeResult = await generateSmartRecipe({
    page,
    locale: targetLocale,
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

  const uploadDecision = await decideUpload(options, isInteractive, adapter);
  const shouldUpload = uploadDecision.shouldUpload;
  wasPrompted = wasPrompted || uploadDecision.prompted;

  if (!shouldUpload) {
    if (!isJsonMode) {
      blankLine();
      console.log(`  ${colorDim("(Skipped upload. Run with --always-upload to always upload.)")}`);
      blankLine();
    }
    printOutput(
      { title: generated.recipeInput.title, recipeInput: generated.recipeInput, payload: generated.payload },
      isJsonMode,
      options.fullResponse ? () => JSON.stringify(generated, null, 2) : undefined
    );
    printSuggestedCommand(cmdArgs, options, programOpts, targetDevice, imageMode, shouldUpload, isJsonMode, wasPrompted);
    return;
  }

  const imageResult = await resolveImageProvider(imageMode, generated, isInteractive, options, logger);
  imageMode = imageResult.imageMode;
  wasPrompted = wasPrompted || imageResult.prompted;
  const imageProvider = imageResult.imageProvider;

  // ── Step 5: Resolve authentication ───────────────────────────────────────
  let authProvider = await resolveAuthInteractively(options, isInteractive, adapter, GLOBAL_ENV_PATH);

  // ── Step 6: Upload ────────────────────────────────────────────────────────
  let uploadResult;
  try {
    const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
    const activeCookie = options.cookie ?? process.env[cookieKey];
    uploadResult = await uploadSmartRecipe({
      page: generated.page,
      recipeInput: generated.recipeInput,
      locale: targetLocale,
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
      blankLine();
      printError(`${adapter.deviceName} session has expired or is invalid.`);
      console.log("  Please authenticate to obtain a new session.");

      // Clear current expired session cookies to force fresh interactive auth
      const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
      delete process.env[cookieKey];
      options.cookie = undefined;

      // Ask for credentials / cookie again
      authProvider = await resolveAuthInteractively(options, isInteractive, adapter, GLOBAL_ENV_PATH);

      // Attempt upload again with the new session
      const session = await authProvider.getSession();
      const newCookie = session.cookie;
      process.env[cookieKey] = newCookie;

      logger.info(`retrying ${adapter.deviceName} upload with new session`);
      uploadResult = await uploadSmartRecipe({
        page: generated.page,
        recipeInput: generated.recipeInput,
        locale: targetLocale,
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

  printSuggestedCommand(cmdArgs, options, programOpts, targetDevice, imageMode, shouldUpload, isJsonMode, wasPrompted);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isInteractiveCli(): boolean {
  return !Boolean(program.optsWithGlobals().json) && process.stdout.isTTY && process.stdin.isTTY;
}

async function resolveCommandDevice(options: any): Promise<"mc" | "tm"> {
  return await getOrPromptDevice(options, isInteractiveCli(), GLOBAL_ENV_PATH);
}

function isSourceAuthError(source: RecipeSource, error: any): boolean {
  const message = error?.message || String(error);

  if (/source ingestion requires .* cookie/i.test(message)) return true;

  if (source.type === "mc") {
    return (
      error instanceof MonsieurCuisineApiError &&
      (error.status === 401 ||
        error.status === 403 ||
        error.code === 110002 ||
        Boolean(error.response && typeof error.response === "object" && (error.response as any).message === "ExpiredAuthCookieException"))
    );
  }

  if (source.type === "cookidoo-official" || source.type === "cookidoo-created") {
    return error instanceof CookidooError && (error.status === 401 || error.status === 403);
  }

  return false;
}

function requireCookieForDevice(device: "mc" | "tm", options: any): string {
  const adapter = getDeviceAdapter(device);
  const cookie = activeCookieForDevice(device, options);
  if (!cookie) {
    const key = cookieKeyForDevice(device);
    throw new Error(`No ${adapter.deviceName} cookie found. Run: smart-recipe login-browser --device ${device} --save\nChecked: --cookie, ${key}${device === "tm" ? ", TM_COOKIES" : ""}`);
  }
  return cookie;
}

async function resolveCookieForDevice(device: "mc" | "tm", options: any): Promise<string> {
  const existingCookie = activeCookieForDevice(device, options);
  if (existingCookie) return existingCookie;

  const adapter = getDeviceAdapter(device) as any;
  if (device === "tm" && typeof adapter.passwordLogin === "function") {
    let email = process.env.TM_LOGIN;
    let cookidooPassword = process.env.TM_PW;
    blankLine();
    printHeading("Sign in to Cookidoo without opening a browser");
    if (!email) {
      email = await input({
        message: "  Cookidoo email",
        validate: (value) => (value.trim() ? true : "Email cannot be empty."),
      });
    }
    if (!cookidooPassword) {
      cookidooPassword = await passwordPrompt({
        message: "  Cookidoo password",
        mask: "*",
        validate: (value) => (value ? true : "Password cannot be empty."),
      });
    }

    printStatus("Signing in to Cookidoo without browser...");
    const result = await adapter.passwordLogin({
      locale: getTmLocale("de-DE"),
      credentials: {
        email,
        password: cookidooPassword,
      },
    });
    process.env.TM_COOKIE = result.cookie;
    if (process.env.SAVE_SETTINGS !== "false" && await shouldSaveGeneratedCookie()) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, "TM_COOKIE", result.cookie);
      if (isInteractiveTerminal()) {
        printSuccess(`Saved TM_COOKIE to ${GLOBAL_ENV_PATH}`);
        blankLine();
      }
    }
    printStatus("Signed in to Cookidoo via OAuth redirect flow.");
    return result.cookie;
  }

  return requireCookieForDevice(device, options);
}

async function shouldSaveGeneratedCookie(): Promise<boolean> {
  if (!isInteractiveTerminal()) return true;
  const saveCookie = await confirm({
    message: "  Save this session cookie to ~/.smart-recipe?",
    default: true,
  });
  if (!saveCookie) {
    process.env.SAVE_SETTINGS = "false";
  }
  return saveCookie;
}

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function buildDoctorReport(device: "mc" | "tm", options: any) {
  const adapter = getDeviceAdapter(device);
  const cookieKey = cookieKeyForDevice(device);
  const cookie = activeCookieForDevice(device, options);
  const report: any = {
    device,
    deviceName: adapter.deviceName,
    configPath: GLOBAL_ENV_PATH,
    localEnvPath: path.resolve(".env"),
    localEnvExists: fs.existsSync(path.resolve(".env")),
    openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    cookie: {
      key: options.cookie ? "--cookie" : cookieKey,
      present: Boolean(cookie)
    },
    auth: {
      checked: false,
      ok: false
    },
    recommendations: [] as string[]
  };

  if (device === "tm") {
    report.tm = {
      locale: getTmLocale("de-DE"),
      version: getTmVersion("tm6")
    };
  } else {
    report.mc = {
      foodProcessor: mcHasFoodProcessor()
    };
  }

  if (!report.openAiKeyPresent) {
    report.recommendations.push("Set OPENAI_API_KEY before importing recipes.");
  }
  if (!cookie) {
    report.recommendations.push(`Run smart-recipe login-browser --device ${device} --save to create a saved session.`);
  } else if (options.checkAuth !== false) {
    report.auth.checked = true;
    try {
      const user = await adapter.getCurrentUser(cookie);
      report.auth.ok = true;
      report.auth.userId = user?.id;
    } catch (error: any) {
      report.auth.ok = false;
      report.auth.message = error?.message || String(error);
      report.recommendations.push(`Refresh the session with smart-recipe login-browser --device ${device} --save.`);
    }
  }

  return report;
}

async function listRecipesCommand(options: any) {
  const device = await resolveCommandDevice(options);
  const adapter = getDeviceAdapter(device);
  const activeCookie = await resolveCookieForDevice(device, options);
  const size = Number(options.limit ?? options.size ?? 20);
  const result = await adapter.listDrafts({ cookie: activeCookie, size }) as any;

  let recipes: any[] = [];
  let total = 0;
  let totalPage = 1;

  recipes = result?.data?.recipes ?? [];
  total = result?.data?.total ?? recipes.length;
  totalPage = result?.data?.totalPage ?? 1;

  if (options.search) {
    const query = String(options.search).toLowerCase();
    recipes = recipes.filter((recipe: any) =>
      String(recipe.title ?? "").toLowerCase().includes(query) ||
      String(recipe.id ?? "").toLowerCase().includes(query)
    );
  }

  const formattedRecipes = recipes.map((recipe: any) => ({
      id: recipe.id,
      title: recipe.title,
      status: recipe.status,
      updatedAt: recipe.updatedAt,
      deviceTypes: recipe.deviceTypes,
      ingredientCount: recipe.ingredientCount,
      stepCount: recipe.stepCount,
      hasImage: recipe.hasImage,
      hasHints: recipe.hasHints,
      recipeUrl: recipe.recipeUrl
    }));

  printOutput({
    total,
    totalPage,
    recipes: formattedRecipes
  }, program.optsWithGlobals().json, (v) => formatRecipesForTerminal(device, v));
}

// ─── Other commands ───────────────────────────────────────────────────────────

program
  .command("login-browser")
  .description("Open an app-style browser login window for the selected device and capture the Cookie header.")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
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
    const device = await resolveCommandDevice(options);
    const adapter = getDeviceAdapter(device);
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
      onStatus: printStatus
    } as any);

    if (options.save) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, cookieKey, result.cookie);
      printStatus(`Saved ${cookieKey} to ${GLOBAL_ENV_PATH}.`);
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
  .description("Fetch a recipe page or authenticated source recipe and display it.")
  .argument("<url>", "Recipe URL")
  .option("--source <source>", "Source type hint: 'web', 'mc', 'cookidoo', or 'tm'")
  .option("--source-cookie <cookie>", "Cookie header for authenticated source recipe ingestion")
  .option("--mc-source-cookie <cookie>", "Monsieur Cuisine source Cookie header")
  .option("--tm-source-cookie <cookie>", "Cookidoo/Thermomix source Cookie header")
  .option("--source-locale <locale>", "Locale used for authenticated source APIs when the source URL/ID does not include one")
  .option("--markdown", "Print the retrieved markdown instead of the formatted source recipe view")
  .option("--no-images", "Do not download image bytes")
  .action(async (url, options) => {
    const source = detectRecipeSource(url, { source: options.source });
    const sourceDevice = sourceDeviceForType(source.type);
    const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
    const sourceOptions = {
      cookies: sourceCookiesFromOptions(options, source),
      locale: sourceLocaleFromOptions(options, source),
      includeImageBytes: options.images,
    };
    let result: { page: RetrievedRecipePage; raw: unknown };
    try {
      result = source.type === "web"
        ? { page: await retrieveRecipePage(source.url, { includeImageBytes: options.images }), raw: undefined }
        : await fetchRecipeSourceWithRaw(source, sourceOptions);
    } catch (error) {
      if (sourceDevice && isInteractive && isSourceAuthError(source, error)) {
        const adapter = getDeviceAdapter(sourceDevice);
        blankLine();
        printStatus(`${adapter.deviceName} session is missing or expired.`);
        const shouldOpen = await confirm({
          message: "  Open the login browser now and retry retrieval?",
          default: true,
        });
        if (!shouldOpen) throw error;

        const loginResult = await adapter.browserLogin({
          locale: sourceDevice === "tm" ? (process.env.TM_LOCALE ?? "de-DE") : (process.env.MC_LOCALE ?? "de-DE"),
          onStatus: printStatus,
        } as any);

        const refreshedCookies = {
          ...sourceOptions.cookies,
          ...(sourceDevice === "tm" ? { tm: loginResult.cookie } : { mc: loginResult.cookie }),
        };
        result = source.type === "web"
          ? { page: await retrieveRecipePage(source.url, { includeImageBytes: options.images }), raw: undefined }
          : await fetchRecipeSourceWithRaw(source, { ...sourceOptions, cookies: refreshedCookies });
      } else {
        throw error;
      }
    }
    const page = result.page;
    const output = {
      source,
      url: page.finalUrl,
      title: page.title,
      markdown: page.markdown,
      recipe: result.raw,
      images: page.images.map(({ bytes, dataUrl, ...image }) => image)
    };
    printOutput(output, program.optsWithGlobals().json, (v) => {
      if (!options.markdown && v.recipe && v.source?.type === "mc") {
        return formatRecipeForTerminal("mc", v.recipe);
      }
      if (!options.markdown && v.recipe && (v.source?.type === "cookidoo-official" || v.source?.type === "cookidoo-created")) {
        return formatRecipeForTerminal("tm", v.recipe);
      }
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
  .option("--device <device>", "Print schema for a specific device ('mc' or 'tm') (prompts if not specified)")
  .action(async (options) => {
    const device = await resolveCommandDevice(options);
    const adapter = getDeviceAdapter(device);
    printOutput(adapter.getSchema(), program.optsWithGlobals().json);
  });

program
  .command("prompt")
  .description("Print the prompt/schema hints used for generation.")
  .option("--device <device>", "Print prompt for a specific device ('mc' or 'tm') (prompts if not specified)")
  .option("--locale <locale>", "Locale for prompt hints", "de-DE")
  .option("--tm-version <version>", "Thermomix version ('tm5', 'tm6', or 'tm7')", "tm6")
  .option("--exclude-modes <modes>", "Comma-separated list of Smart modes to exclude")
  .option("--mc-food-processor <boolean>", "Whether you own the Monsieur Cuisine food processor attachment (true/false)")
  .action(async (options) => {
    if (options.mcFoodProcessor) {
      process.env.MC_HAS_FOOD_PROCESSOR = options.mcFoodProcessor.toLowerCase();
    }
    const device = await resolveCommandDevice(options);
    const excludeModes = options.excludeModes
      ? options.excludeModes.split(",").map((m: string) => m.trim())
      : [];
    if (device === "mc" && !mcHasFoodProcessor()) {
      if (!excludeModes.includes("foodProcessor")) {
        excludeModes.push("foodProcessor");
      }
    }
    const adapter = getDeviceAdapter(device);
    const promptOpts = device === "tm" ? {
      tmVersion: options.tmVersion,
      excludeModes: excludeModes.length > 0 ? excludeModes : undefined
    } : {
      excludeModes: excludeModes.length > 0 ? excludeModes : undefined
    };
    console.log(adapter.getPromptInstructions(options.locale, promptOpts));
  });

program
  .command("catalog")
  .description("Show verified and planned locale/catalog data for the targeted device.")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
  .action(async (options) => {
    const device = await resolveCommandDevice(options);
    if (device === "tm") {
      console.log("\n  Thermomix (Cookidoo) My Creations does not use a fixed category or complexity catalog.");
      console.log("  Recipes are uploaded as custom drafts with free-text content.");
      return;
    }
    printOutput({
      supportedLocales,
      plannedLocales,
      categoriesByLocale: Object.fromEntries(supportedLocales.map((locale) => [locale, categoryPromptText(locale)]))
    }, program.optsWithGlobals().json);
  });

program
  .command("doctor")
  .description("Show local configuration, authentication, and device readiness.")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
  .option("--cookie <cookie>", "Cookie header to check instead of saved configuration")
  .option("--no-check-auth", "Skip the live session check")
  .action(async (options) => {
    const device = await resolveCommandDevice(options);
    const report = await buildDoctorReport(device, options);
    printOutput(report, program.optsWithGlobals().json, formatDoctorForTerminal);
  });

program
  .command("me")
  .alias("profile")
  .description("Check the current session.")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
  .option("--cookie <cookie>", "Cookie header")
  .action(async (options) => {
    const device = await resolveCommandDevice(options);
    const adapter = getDeviceAdapter(device);
    const activeCookie = await resolveCookieForDevice(device, options);

    printOutput(await adapter.getCurrentUser(activeCookie), program.optsWithGlobals().json, (v) => {
      return formatUserForTerminal(device, v);
    });
  });

program
  .command("recipes")
  .alias("drafts")
  .description("List recipes visible to the current session.")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
  .option("--cookie <cookie>", "Cookie header")
  .option("--size <size>", "Number of recipes to fetch", "20")
  .option("--limit <limit>", "Alias for --size")
  .option("--search <query>", "Filter listed recipes by title or ID")
  .action(listRecipesCommand);

program
  .command("recipe")
  .alias("get-recipe")
  .description("Fetch and display a single recipe.")
  .argument("<id>", "Recipe ID (e.g. 01KB04WSJP4SHNBKJK4H4FT0PZ or 12345)")
  .option("--device <device>", "Target device: 'mc' or 'tm' (prompts if not specified)")
  .option("--cookie <cookie>", "Cookie header")
  .option("--public", "Fetch from the public created-recipes endpoint instead of own (Thermomix only)")
  .option("--input", "Print mapped internal recipe input JSON instead of a pretty recipe view")
  .action(async (id, options) => {
    const device = await resolveCommandDevice(options);
    const adapter = getDeviceAdapter(device);
    const activeCookie = await resolveCookieForDevice(device, options);

    const result = await adapter.getRecipe({ cookie: activeCookie, id, public: options.public });
    if (options.input) {
      const input = mapRecipeToInput(device, result);
      printOutput(input, true);
      return;
    }
    printOutput(result, program.optsWithGlobals().json, (v) => {
      return formatRecipeForTerminal(device, v);
    });
  });

const isTestEnv = typeof process !== "undefined" && (
  process.env.VITEST === "true" ||
  process.env.NODE_ENV === "test" ||
  (Array.isArray(process.argv) && process.argv.some(arg => arg.includes("vitest")))
);

if (!isTestEnv) {
  program.parseAsync().catch((error) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}

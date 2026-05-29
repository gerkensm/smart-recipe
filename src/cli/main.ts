#!/usr/bin/env node
import process from "node:process";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Command, Help } from "commander";
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
import { loadDotEnv, upsertDotEnvValue, getTargetDevice, getTmVersion, getTmLocale, getTmCookie, mcHasFoodProcessor } from "../config/env.js";
import { categoryPromptText, plannedLocales, supportedLocales } from "../catalogs/index.js";
import type { SupportedLocale } from "../catalogs/types.js";
import { buildRecipeInstructions } from "../llm/prompts.js";
import { BrowserCookieAuthProvider, CookieAuthProvider } from "../mc/auth.js";
import { browserLoginForMonsieurCuisine } from "../mc/browser-login.js";
import { AuthFlowError, MonsieurCuisineApiError } from "../mc/errors.js";
import { MonsieurCuisineSmartClient } from "../mc/client.js";
import { CookidooError } from "../devices/tm/errors.js";
import { getLocalization } from "../devices/tm/client.js";
import type { CookidooRecipeInput } from "../devices/tm/schema.js";
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
import {
  mapOfficialCookidooToInput,
  mapCustomCookidooToInput,
} from "./cookidoo-mappers.js";
export {
  cleanHtmlText,
  parseIsoDuration,
  mapOfficialCookidooToInput,
  mapCustomCookidooToInput,
} from "./cookidoo-mappers.js";
import { formatDoctorForTerminal, formatRecipesForTerminal } from "./formatters.js";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { detectRecipeSource, fetchRecipeSourceAsPage, fetchRecipeSourceWithRaw, type RecipeSource } from "../sources/index.js";

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

  // ── Step 0: Determine target device ───────────────────────────────────────
  let targetDevice: "mc" | "tm";
  if (options.target && !options.device) {
    options.device = options.target;
  }
  if (!process.env.TARGET_DEVICE && !options.device) {
    if (isInteractive) {
      wasPrompted = true;
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

      const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
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
      } else {
        process.env.SAVE_SETTINGS = "false";
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
      wasPrompted = true;
      const tmVersion = await select({
        message: "Which Thermomix model do you own?",
        choices: [
          { name: "TM7", value: "tm7" as const },
          { name: "TM6", value: "tm6" as const },
          { name: "TM5", value: "tm5" as const }
        ]
      });
      const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
        message: "Save this Thermomix model to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "TM_VERSION", tmVersion);
        console.log(`✓ Saved TM_VERSION to ${GLOBAL_ENV_PATH}\n`);
      } else {
        process.env.SAVE_SETTINGS = "false";
      }
      process.env.TM_VERSION = tmVersion;
    } else {
      process.env.TM_VERSION = "tm6";
    }
  }

  if (targetDevice === "mc" && typeof process.env.MC_HAS_FOOD_PROCESSOR === "undefined") {
    if (isInteractive) {
      wasPrompted = true;
      const mcHasFoodProcessor = await confirm({
        message: "Do you own the optional Food Processor (cutter) attachment for Monsieur Cuisine?",
        default: false
      });
      const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
        message: "Save this setting to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "MC_HAS_FOOD_PROCESSOR", String(mcHasFoodProcessor));
        console.log(`✓ Saved MC_HAS_FOOD_PROCESSOR to ${GLOBAL_ENV_PATH}\n`);
      } else {
        process.env.SAVE_SETTINGS = "false";
      }
      process.env.MC_HAS_FOOD_PROCESSOR = String(mcHasFoodProcessor);
    } else {
      process.env.MC_HAS_FOOD_PROCESSOR = "false"; // default to false if non-interactive (default off)
    }
  }

  const adapter = getDeviceAdapter(targetDevice);
  const targetLocaleResult = await getOrPromptTargetLocale(targetDevice, options, isInteractive);
  const targetLocale = targetLocaleResult.locale;
  wasPrompted = wasPrompted || targetLocaleResult.prompted;

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

    const saveKey = process.env.SAVE_SETTINGS !== "false" && await confirm({
      message: "  Save this key to ~/.smart-recipe?",
      default: true
    });
    if (saveKey) {
      upsertDotEnvValue(GLOBAL_ENV_PATH, "OPENAI_API_KEY", apiKey.trim());
      console.log(`  \x1b[32m✓ Saved to ${GLOBAL_ENV_PATH}\x1b[0m\n`);
    } else {
      process.env.SAVE_SETTINGS = "false";
    }
  }

  // ── Step 2: Generate the recipe ───────────────────────────────────────────
  // Image provider is resolved later (Step 4.5), after the user confirms upload.
  // Pre-compute the flag values here so the logic below is cleaner.
  const imageExplicitMode: "generate" | "generate-with-sources" | "skip" | "none" | null =
    options.noImage ? "none"
    : options.useSourceImage ? "skip"
    : (options.recreateImageWithSourceImages || options.imageReferenceSource) ? "generate-with-sources"
    : options.recreateImage ? "generate"
    : null; // null = ask interactively

  let imageMode: "generate" | "generate-with-sources" | "skip" | "none" | null = imageExplicitMode;

  const excludeModes: string[] = options.excludeModes
    ? options.excludeModes.split(",").map((m: string) => m.trim())
    : [];

  if (targetDevice === "mc" && !mcHasFoodProcessor()) {
    if (!excludeModes.includes("foodProcessor")) {
      excludeModes.push("foodProcessor");
    }
  }

  // cook mode (Garen) is not available for My Creations on Cookidoo — exclude by default.
  // Users can opt in with --extend-tm-modes if they want to experiment.
  if (targetDevice === "tm" && !(options.extendTmModes || options.experimentalTmModes)) {
    if (!excludeModes.includes("cook")) {
      excludeModes.push("cook");
    }
  }

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

  // ── Step 4: Decide whether to upload ─────────────────────────────────────
  let shouldUpload: boolean;
  if (options.dryRun) {
    shouldUpload = false;
  } else if (options.alwaysUpload) {
    shouldUpload = true;
  } else if (isInteractive) {
    wasPrompted = true;
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
      console.log("\n  \x1b[2m(Skipped upload. Run with --always-upload to always upload.)\x1b[0m\n");
    }
    printOutput(
      { title: generated.recipeInput.title, recipeInput: generated.recipeInput, payload: generated.payload },
      isJsonMode,
      options.fullResponse ? () => JSON.stringify(generated, null, 2) : undefined
    );
    printSuggestedCommand(cmdArgs, options, programOpts, targetDevice, imageMode, shouldUpload, isJsonMode, wasPrompted);
    return;
  }

  // ── Step 4.5: Resolve image provider ─────────────────────────────────────
  if (imageMode === null && isInteractive) {
    wasPrompted = true;
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
    const saveCookie = process.env.SAVE_SETTINGS !== "false" && await confirm({
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

  const saveCookie = process.env.SAVE_SETTINGS !== "false" && await confirm({
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

async function getOrPromptDevice(options: any): Promise<"mc" | "tm"> {
  const isJsonMode = Boolean(program.opts().json);
  const isInteractive = !isJsonMode && process.stdout.isTTY && process.stdin.isTTY;

  let device = options.device || process.env.TARGET_DEVICE;
  if (!device) {
    if (isInteractive) {
      console.log();
      device = await select({
        message: "Which smart cooker do you want to target?",
        choices: [
          { name: "Monsieur Cuisine (MC)", value: "mc" as const },
          { name: "Thermomix (TM)", value: "tm" as const }
        ]
      });

      const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
        message: "Save this cooker choice to ~/.smart-recipe?",
        default: true
      });
      if (saveSettings) {
        upsertDotEnvValue(GLOBAL_ENV_PATH, "TARGET_DEVICE", device);
        console.log(`✓ Saved TARGET_DEVICE to ${GLOBAL_ENV_PATH}\n`);
      } else {
        process.env.SAVE_SETTINGS = "false";
      }
    } else {
      device = "mc"; // default fallback for non-interactive
    }
  }
  const val = device.toLowerCase();
  return (val === "tm" || val === "thermomix") ? "tm" : "mc";
}

function cookieKeyForDevice(device: "mc" | "tm"): "MC_COOKIE" | "TM_COOKIE" {
  return device === "tm" ? "TM_COOKIE" : "MC_COOKIE";
}

function activeCookieForDevice(device: "mc" | "tm", options: any): string | undefined {
  if (options.cookie) return options.cookie;
  return device === "tm" ? getTmCookie() : process.env.MC_COOKIE;
}

function sourceCookiesFromOptions(options: any, detectedSource?: RecipeSource): { mc?: string; tm?: string } {
  const sourceType = options.source ?? detectedSource?.type;
  return {
    mc: options.mcSourceCookie ?? (sourceType === "mc" ? options.sourceCookie : undefined) ?? process.env.MC_COOKIE,
    tm: options.tmSourceCookie ?? (
      sourceType === "tm" ||
      sourceType === "cookidoo" ||
      sourceType === "cookidoo-official" ||
      sourceType === "cookidoo-created"
        ? options.sourceCookie
        : undefined
    ) ?? getTmCookie(),
  };
}

function sourceLocaleFromOptions(options: any, detectedSource: RecipeSource): string {
  if (options.sourceLocale) return normalizeSupportedLocale(options.sourceLocale) ?? options.sourceLocale;
  if ("locale" in detectedSource && detectedSource.locale) return detectedSource.locale;
  const sourceDevice = sourceDeviceForType(detectedSource.type);
  if (sourceDevice === "tm") return normalizeSupportedLocale(getTmLocale("de-DE")) ?? getTmLocale("de-DE");
  if (sourceDevice === "mc") return normalizeSupportedLocale(process.env.MC_LOCALE) ?? process.env.MC_LOCALE ?? "de-DE";
  return normalizeSupportedLocale(options.locale ?? options.language) ?? options.locale ?? options.language ?? "de-DE";
}

function sourceDeviceForType(sourceType: RecipeSource["type"]): "mc" | "tm" | null {
  if (sourceType === "mc") return "mc";
  if (sourceType === "cookidoo-official" || sourceType === "cookidoo-created") return "tm";
  return null;
}

const localeChoiceLabels: Record<SupportedLocale, string> = {
  "de-DE": "German (Germany)",
  "en-US": "English (US)",
  "fr-FR": "French (France)",
  "it-IT": "Italian (Italy)",
  "pl-PL": "Polish (Poland)",
  "cs-CZ": "Czech (Czechia)",
};

const localeAliases: Record<string, SupportedLocale> = {
  cs: "cs-CZ",
  "cs-cz": "cs-CZ",
  cz: "cs-CZ",
  de: "de-DE",
  "de-de": "de-DE",
  en: "en-US",
  "en-us": "en-US",
  fr: "fr-FR",
  "fr-fr": "fr-FR",
  it: "it-IT",
  "it-it": "it-IT",
  pl: "pl-PL",
  "pl-pl": "pl-PL",
};

function localeEnvKeyForDevice(device: "mc" | "tm"): "MC_LOCALE" | "TM_LOCALE" {
  return device === "tm" ? "TM_LOCALE" : "MC_LOCALE";
}

function normalizeSupportedLocale(value: unknown): SupportedLocale | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const alias = localeAliases[normalized.toLowerCase()];
  if (alias) return alias;
  return (supportedLocales as readonly string[]).includes(normalized)
    ? normalized as SupportedLocale
    : undefined;
}

async function getOrPromptTargetLocale(
  targetDevice: "mc" | "tm",
  options: any,
  isInteractive: boolean
): Promise<{ locale: SupportedLocale; prompted: boolean }> {
  const localeKey = localeEnvKeyForDevice(targetDevice);
  const rawLocale = options.locale ?? options.language ?? process.env[localeKey];
  const locale = normalizeSupportedLocale(rawLocale);
  if (rawLocale && !locale) {
    throw new Error(`Unsupported locale ${rawLocale}. Supported locales: ${supportedLocales.join(", ")}`);
  }
  if (locale) {
    process.env[localeKey] = locale;
    return { locale, prompted: false };
  }

  if (!isInteractive) {
    process.env[localeKey] = "de-DE";
    return { locale: "de-DE", prompted: false };
  }

  const selectedLocale = await select<SupportedLocale>({
    message: `Which language/locale should the generated ${targetDevice === "tm" ? "Thermomix" : "Monsieur Cuisine"} recipe use?`,
    choices: supportedLocales.map((value) => ({
      name: `${localeChoiceLabels[value]} (${value})`,
      value,
    })),
    default: "de-DE",
  });

  const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
    message: `Save this ${targetDevice === "tm" ? "Thermomix" : "Monsieur Cuisine"} locale to ~/.smart-recipe?`,
    default: true,
  });
  if (saveSettings) {
    upsertDotEnvValue(GLOBAL_ENV_PATH, localeKey, selectedLocale);
    console.log(`✓ Saved ${localeKey} to ${GLOBAL_ENV_PATH}\n`);
  } else {
    process.env.SAVE_SETTINGS = "false";
  }
  process.env[localeKey] = selectedLocale;
  return { locale: selectedLocale, prompted: true };
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
  const device = await getOrPromptDevice(options);
  const adapter = getDeviceAdapter(device);
  const activeCookie = requireCookieForDevice(device, options);
  const size = Number(options.limit ?? options.size ?? 20);
  const result = await adapter.listDrafts({ cookie: activeCookie, size }) as any;

  let recipes: any[] = [];
  let total = 0;
  let totalPage = 1;

  if (adapter.id === "tm") {
    recipes = result?.data?.recipes ?? [];
    total = result?.data?.total ?? recipes.length;
    totalPage = result?.data?.totalPage ?? 1;
  } else {
    recipes = (result?.data?.recipes ?? []).map((recipe: any) => ({
      id: recipe.id,
      title: recipe.title,
      status: recipe.status,
      updatedAt: recipe.updatedAt,
      deviceTypes: recipe.deviceTypes,
      ingredientCount: recipe.ingredientCount,
      stepCount: recipe.stepCount,
      hasImage: recipe.hasImage,
      hasHints: recipe.hasHints
    }));
    total = result?.data?.total ?? recipes.length;
    totalPage = result?.data?.totalPage ?? 1;
  }

  if (options.search) {
    const query = String(options.search).toLowerCase();
    recipes = recipes.filter((recipe: any) =>
      String(recipe.title ?? "").toLowerCase().includes(query) ||
      String(recipe.id ?? "").toLowerCase().includes(query)
    );
  }

  const formattedRecipes = recipes.map((recipe: any) => {
    let recipeUrl = recipe.recipeUrl;
    if (!recipeUrl && recipe.id) {
      if (adapter.id === "tm") {
        const loc = getLocalization(getTmLocale("de-DE"));
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
      ingredientCount: recipe.ingredientCount,
      stepCount: recipe.stepCount,
      hasImage: recipe.hasImage,
      hasHints: recipe.hasHints,
      recipeUrl
    };
  });

  printOutput({
    total,
    totalPage,
    recipes: formattedRecipes
  }, program.optsWithGlobals().json, (v) => formatRecipesForTerminal(device, v));
}

function mapRecipeToInput(device: "mc" | "tm", recipe: any): any {
  if (device === "tm") {
    return recipe && recipe["@type"] === "Recipe"
      ? mapOfficialCookidooToInput(recipe)
      : mapCustomCookidooToInput(recipe);
  }
  return mapMonsieurCuisineToInput(recipe);
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
    const device = await getOrPromptDevice(options);
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
        console.error(`\n  ${adapter.deviceName} session is missing or expired.`);
        const shouldOpen = await confirm({
          message: "  Open the login browser now and retry retrieval?",
          default: true,
        });
        if (!shouldOpen) throw error;

        const loginResult = await adapter.browserLogin({
          locale: sourceDevice === "tm" ? (process.env.TM_LOCALE ?? "de-DE") : (process.env.MC_LOCALE ?? "de-DE"),
          onStatus: (message: string) => console.error(message),
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
    const device = await getOrPromptDevice(options);
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
    const device = await getOrPromptDevice(options);
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
    const device = await getOrPromptDevice(options);
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
    const device = await getOrPromptDevice(options);
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
    const device = await getOrPromptDevice(options);
    const adapter = getDeviceAdapter(device);
    const activeCookie = requireCookieForDevice(device, options);

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
    const device = await getOrPromptDevice(options);
    const adapter = getDeviceAdapter(device);
    const activeCookie = requireCookieForDevice(device, options);

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
    if (error instanceof MonsieurCuisineApiError) {
      console.error(formatMonsieurCuisineApiError(error));
    } else if (error instanceof AuthFlowError) {
      console.error(formatAuthFlowError(error));
    } else if (error instanceof CookidooError) {
      console.error(formatCookidooError(error));
    } else {
      console.error(formatGenericCliError(error));
    }
    process.exitCode = 1;
  });
}

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

function printSuggestedCommand(
  cmdArgs: string[] | undefined,
  options: any,
  programOpts: any,
  targetDevice: string,
  imageMode: string | null,
  shouldUpload: boolean,
  isJsonMode: boolean,
  wasPrompted: boolean
): void {
  if (isJsonMode || !cmdArgs || !wasPrompted) return;

  const suggestedFlags: string[] = [];
  if (typeof options.device === "undefined") {
    suggestedFlags.push(`--device ${targetDevice}`);
  }
  if (targetDevice === "tm" && typeof options.tmVersion === "undefined" && process.env.TM_VERSION) {
    suggestedFlags.push(`--tm-version ${process.env.TM_VERSION}`);
  }
  if (targetDevice === "mc" && typeof options.mcFoodProcessor === "undefined" && typeof process.env.MC_HAS_FOOD_PROCESSOR !== "undefined") {
    suggestedFlags.push(`--mc-food-processor ${process.env.MC_HAS_FOOD_PROCESSOR}`);
  }
  const localeKey = targetDevice === "tm" ? "TM_LOCALE" : "MC_LOCALE";
  if (typeof options.locale === "undefined" && typeof options.language === "undefined" && process.env[localeKey]) {
    suggestedFlags.push(`--locale ${process.env[localeKey]}`);
  }

  const hasImageOption = options.noImage || options.useSourceImage || options.recreateImage || options.recreateImageWithSourceImages || options.imageReferenceSource;
  if (!hasImageOption && imageMode) {
    if (imageMode === "skip") suggestedFlags.push("--use-source-image");
    else if (imageMode === "none") suggestedFlags.push("--no-image");
    else if (imageMode === "generate") suggestedFlags.push("--recreate-image");
    else if (imageMode === "generate-with-sources") suggestedFlags.push("--recreate-image-with-source-images");
  }

  if (typeof options.alwaysUpload === "undefined" && typeof options.dryRun === "undefined") {
    if (shouldUpload) {
      suggestedFlags.push("--always-upload");
    } else {
      suggestedFlags.push("--dry-run");
    }
  }

  if (programOpts.saveSettings !== false && process.env.SAVE_SETTINGS === "false") {
    suggestedFlags.push("--no-save-settings");
  }

  if (suggestedFlags.length > 0) {
    const quote = (val: string) => val.includes(" ") ? `"${val}"` : val;
    const cmdStr = ["smart-recipe", ...cmdArgs.map(quote), ...suggestedFlags].join(" ");
    console.log(`\n  \x1b[2mNext time, in order to pick these settings, execute with:\x1b[0m`);
    console.log(`  \x1b[36m$ ${cmdStr}\x1b[0m\n`);
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

function formatGenericCliError(error: any): string {
  const message = error?.stack || error?.message || String(error);
  const plain = error?.message || String(error);
  const suggestions: string[] = [];

  if (/No .* cookie found/i.test(plain)) {
    suggestions.push("Run smart-recipe login-browser --device <mc|tm> --save to refresh the saved session.");
    suggestions.push("Run smart-recipe doctor --device <mc|tm> to inspect configuration.");
  }
  if (/source ingestion requires .* cookie/i.test(plain)) {
    suggestions.push("Run smart-recipe login-browser --device <mc|tm> to obtain a fresh session cookie.");
  }
  if (/session is missing or expired/i.test(plain)) {
    suggestions.push("Open the login browser and retry when prompted.");
  }
  if (/unknown option/i.test(plain)) {
    suggestions.push("Run smart-recipe --help or smart-recipe <command> --help to see supported options.");
  }
  if (/OPENAI_API_KEY/i.test(plain)) {
    suggestions.push("Set OPENAI_API_KEY in the environment or ~/.smart-recipe.");
  }

  if (suggestions.length === 0) return message;
  return [
    message,
    "",
    "Suggested next steps:",
    ...suggestions.map((suggestion) => `- ${suggestion}`)
  ].join("\n");
}

export function mapMonsieurCuisineToInput(recipe: any): any {
  const serving = recipe.servingSizes?.[0] || recipe.servingSize || {};
  return {
    title: recipe.title || "Recipe",
    description: recipe.description || "",
    settings: {
      locale: recipe.languageLocale || "de-DE",
      complexityId: recipe.complexity?.id || 142
    },
    status: recipe.status,
    nutrients: recipe.nutrients,
    servingSize: {
      amount: serving.amount || 1,
      unit: serving.unit || "Portion",
      preparationTime: serving.preparationTime || 0,
      readyInTime: serving.readyInTime || 0,
      ingredientGroups: (serving.ingredientGroups || []).map((g: any) => ({
        name: g.name || "",
        ingredients: (g.ingredients || []).map((i: any) => ({
          name: i.name,
          amount: i.amount || "",
          unit: i.unit || "",
          isOptional: i.isOptional
        }))
      })),
      steps: (serving.steps || []).map((s: any) => {
        let mappedMode: any = { type: "none" };
        if (s.mode) {
          const type = s.mode.type;
          const settings = s.mode.deviceSettings?.[0] || {};
          const duration = settings.time || 0;
          const mins = Math.floor(duration / 60);
          const secs = duration % 60;
          
          if (type === "manualCooking" || type === "manual_cooking") {
            mappedMode = {
              type: "manualCooking",
              temperature: settings.temperature || 0,
              minutes: mins,
              seconds: secs,
              speed: settings.speed || 0,
              rotationDirection: settings.clockwise === false ? "left" : "right"
            };
          } else if (type === "turbo") {
            mappedMode = { type: "turbo", seconds: duration };
          } else if (type === "scale") {
            mappedMode = { type: "scale", grams: settings.weight || 0 };
          } else if (type === "roasting" || type === "roast") {
            mappedMode = {
              type: "roast",
              temperature: settings.temperature || 0,
              minutes: mins,
              seconds: secs
            };
          } else if (type === "solid_dough_knead" || type === "solidDoughKnead") {
            mappedMode = { type: "solidDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "soft_dough_knead" || type === "softDoughKnead") {
            mappedMode = { type: "softDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "liquid_dough_knead" || type === "liquidDoughKnead") {
            mappedMode = { type: "liquidDoughKnead", minutes: mins, seconds: secs };
          } else if (type === "steam" || type === "steaming") {
            mappedMode = { type: "steam", minutes: mins, seconds: secs };
          } else if (type === "sous_vide" || type === "sousVide") {
            mappedMode = { type: "sousVide", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "slow_cooking" || type === "slowCooking") {
            mappedMode = { type: "slowCooking", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "cooking_eggs" || type === "cookingEggs") {
            mappedMode = { type: "cookingEggs", size: s.mode.modeSetting?.size || "medium", texture: s.mode.modeSetting?.texture || "waxy_soft" };
          } else if (type === "precleaning") {
            mappedMode = { type: "precleaning", duration: s.mode.modeSetting?.duration || "short" };
          } else if (type === "fermentation") {
            mappedMode = { type: "fermentation", temperature: settings.temperature || 0, minutes: mins, seconds: secs };
          } else if (type === "rice_cooking" || type === "riceCooking") {
            mappedMode = { type: "riceCooking", minutes: mins, seconds: secs };
          } else if (type === "food_cooking" || type === "foodProcessor") {
            mappedMode = { type: "foodProcessor", minutes: mins, seconds: secs };
          } else if (type === "puree") {
            mappedMode = { type: "puree", minutes: mins, seconds: secs };
          } else if (type === "smoothie") {
            mappedMode = { type: "smoothie", minutes: mins, seconds: secs };
          }
        }
        return {
          title: s.title || s.description || s.text || "",
          description: s.title ? (s.description || s.text || "") : "",
          mode: mappedMode
        };
      })
    }
  };
}

export function formatRecipeForTerminal(device: "mc" | "tm", recipe: any): string {
  const adapter = getDeviceAdapter(device);
  
  if (device === "tm") {
    let input: CookidooRecipeInput;
    const looksLikeOfficialCookidooRecipe =
      Boolean(recipe && (
        recipe["@type"] === "Recipe" ||
        recipe.recipeIngredientGroups ||
        recipe.recipeStepGroups ||
        recipe.servingSize
    ));
    if (looksLikeOfficialCookidooRecipe) {
      input = mapOfficialCookidooToInput(recipe);
    } else {
      input = mapCustomCookidooToInput(recipe);
    }
    return adapter.formatInputForTerminal(input);
  } else {
    const input = mapMonsieurCuisineToInput(recipe?.data?.recipe ?? recipe);
    return adapter.formatInputForTerminal(input);
  }
}

export function formatUserForTerminal(device: "mc" | "tm", user: any): string {
  const parts: string[] = [];
  const boldMagenta = "\x1b[1m\x1b[95m";
  const boldCyan = "\x1b[1m\x1b[36m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";
  const boldYellow = "\x1b[1m\x1b[93m";

  const title = "User Session Profile";
  const line = "─".repeat(title.length + 4);
  parts.push("");
  parts.push(`  ${gray}┌${line}┐${reset}`);
  parts.push(`  ${gray}│  ${reset}${boldMagenta}${title}${reset}${gray}  │${reset}`);
  parts.push(`  ${gray}└${line}┘${reset}`);
  parts.push("");

  const devName = device === "tm" ? "Thermomix (Cookidoo)" : "Monsieur Cuisine";
  let name = "N/A";
  let email = "N/A";
  let locale = "de-DE";

  if (device === "tm") {
    const userInfo = user.userInfo ?? {};
    name = `${user.givenName ?? ""} ${user.lastName ?? ""}`.trim() || userInfo.username || "N/A";
    email = user.email || "N/A";
    locale = user.locale || "de-DE";
  } else {
    name = user.displayName || user.nickname || user.username || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "N/A";
    email = user.email || "N/A";
    locale = user.languageLocale || "de-DE";
  }

  parts.push(`  Device:     ${boldCyan}${devName}${reset}`);
  if (user.id) parts.push(`  ID:         ${boldCyan}${user.id}${reset}`);
  parts.push(`  Name:       ${boldCyan}${name}${reset}`);
  parts.push(`  Email:      ${boldCyan}${email}${reset}`);
  parts.push(`  Locale:     ${boldCyan}${locale}${reset}`);

  if (device === "tm") {
    const userInfo = user.userInfo ?? {};
    parts.push(`  Public:     ${boldCyan}${formatBoolean(user.isPublic)}${reset}`);
    if (userInfo.picture) parts.push(`  Picture:    ${boldCyan}${userInfo.picture}${reset}`);
    if (userInfo.pictureTemplate) parts.push(`  PictureTpl: ${boldCyan}${userInfo.pictureTemplate}${reset}`);

    const savedSearches = Array.isArray(user.savedSearches) ? user.savedSearches : [];
    parts.push("");
    parts.push(`  ${boldYellow}Saved Searches${reset}`);
    if (savedSearches.length === 0) {
      parts.push(`    ${gray}None${reset}`);
    } else {
      savedSearches.forEach((savedSearch: any, index: number) => {
        const search = savedSearch.search ?? {};
        parts.push(`    ${index + 1}. ${boldCyan}${savedSearch.id ?? "unnamed"}${reset}`);
        parts.push(`       Countries:    ${formatList(search.countries)}`);
        parts.push(`       Languages:    ${formatList(search.languages)}`);
        parts.push(`       Accessories:  ${formatAccessoryList(search.accessories)}`);
      });
    }

    parts.push("");
    parts.push(`  ${boldYellow}Food Preferences${reset}`);
    parts.push(`    ${formatList(user.foodPreferences)}`);

    parts.push("");
    parts.push(`  ${boldYellow}Thermomixes${reset}`);
    const thermomixes = Array.isArray(user.thermomixes) ? user.thermomixes : [];
    if (thermomixes.length === 0) {
      parts.push(`    ${gray}None registered in profile response${reset}`);
    } else {
      thermomixes.forEach((tm: any, index: number) => {
        parts.push(`    ${index + 1}. ${formatObjectSummary(tm)}`);
      });
    }

    if (user.meta && Object.keys(user.meta).length > 0) {
      parts.push("");
      parts.push(`  ${boldYellow}Meta${reset}`);
      Object.entries(user.meta).forEach(([key, value]) => {
        parts.push(`    ${key}: ${formatScalar(value)}`);
      });
    }
  }

  parts.push("");

  return parts.join("\n");
}

function formatBoolean(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "N/A";
}

function formatList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  return value.map(formatScalar).join(", ");
}

function formatAccessoryList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  return value.map((accessory) => {
    const raw = String(accessory);
    const label = TM_ACCESSORY_LABELS[raw];
    return label ? `${label} (${raw})` : raw;
  }).join(", ");
}

function formatObjectSummary(value: unknown): string {
  if (!value || typeof value !== "object") return formatScalar(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => `${key}: ${formatScalar(entryValue)}`)
    .join(", ");
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (Array.isArray(value)) return formatList(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const TM_ACCESSORY_LABELS: Record<string, string> = {
  includingFriend: "Thermomix Friend",
  includingBladeCover: "Blade Cover",
  includingBladeCoverWithPeeler: "Blade Cover with Peeler",
  includingCutter: "Thermomix Cutter",
  includingCutterPlus: "Thermomix Cutter+",
  includingSensor: "Thermomix Sensor",
};

export function formatDraftsForTerminal(device: "mc" | "tm", result: any): string {
  const parts: string[] = [];
  const boldMagenta = "\x1b[1m\x1b[95m";
  const boldCyan = "\x1b[1m\x1b[36m";
  const boldGreen = "\x1b[1m\x1b[92m";
  const boldYellow = "\x1b[1m\x1b[93m";
  const reset = "\x1b[0m";
  const gray = "\x1b[90m";

  const count = result.recipes?.length ?? 0;
  const title = `Draft Recipes List (${count} drafts found)`;
  const line = "─".repeat(title.length + 4);
  parts.push("");
  parts.push(`  ${gray}┌${line}┐${reset}`);
  parts.push(`  ${gray}│  ${reset}${boldMagenta}${title}${reset}${gray}  │${reset}`);
  parts.push(`  ${gray}└${line}┘${reset}`);
  parts.push("");

  if (count === 0) {
    parts.push(`  ${boldYellow}No drafts found on this device.${reset}`);
    parts.push("");
    return parts.join("\n");
  }

  result.recipes.forEach((recipe: any, idx: number) => {
    parts.push(`  ${boldGreen}[${idx + 1}]${reset}  ${boldCyan}${recipe.title}${reset} (${recipe.status || "draft"})`);
    parts.push(`       ID:  ${recipe.id}`);
    if (recipe.recipeUrl) {
      parts.push(`       URL: ${recipe.recipeUrl}`);
    }
    if (recipe.updatedAt) {
      const dateStr = recipe.updatedAt.slice(0, 10);
      parts.push(`       Updated: ${dateStr}`);
    }
    parts.push("");
  });

  return parts.join("\n");
}

import process from "node:process";
import { upsertDotEnvValue, mcHasFoodProcessor } from "../config/env.js";
import type { GenerateSmartRecipeResult } from "../pipeline/import-url.js";
import { OpenAIRecipeImageGenerator } from "../llm/openai-image-generator.js";
import { NullImageProvider, type RecipeImageAsset, type RecipeImageProvider } from "../pipeline/images.js";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { SmartRecipeLogger } from "../logging/logger.js";
import { confirm, password, select } from "./prompts.js";
import { blankLine, colorCyan, colorDim, printSuccess, printWarning } from "./terminal.js";
import { withCliSpinner } from "./spinner.js";

export type RecipeImageMode = "generate" | "generate-with-sources" | "skip" | "none";

export async function resolveTargetDeviceSettings(
  options: any,
  isInteractive: boolean,
  configPath: string
): Promise<{ device: "mc" | "tm"; prompted: boolean }> {
  let prompted = false;

  if (options.target && !options.device) {
    options.device = options.target;
  }

  let device: "mc" | "tm";
  if (!process.env.TARGET_DEVICE && !options.device) {
    if (isInteractive) {
      prompted = true;
      blankLine();
      device = await selectTargetDevice();
      await promptAndPersistInitialDeviceSettings(device, configPath);
    } else {
      device = "mc";
    }
  } else {
    device = normalizeDeviceOption(options.device || process.env.TARGET_DEVICE || "mc");
  }

  if (options.tmVersion) {
    process.env.TM_VERSION = options.tmVersion.toLowerCase();
  }

  prompted = await ensureDeviceSpecificSettings(device, isInteractive, configPath) || prompted;
  return { device, prompted };
}

export async function ensureOpenAIKey(isInteractive: boolean, configPath: string): Promise<void> {
  if (process.env.OPENAI_API_KEY) return;
  if (!isInteractive) {
    throw new Error("OPENAI_API_KEY is not set. Provide it via the environment or run interactively.");
  }

  blankLine();
  printWarning("No OpenAI API key found.");
  console.log(`  You can get one at ${colorCyan("https://platform.openai.com/api-keys")}`);
  blankLine();

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
    upsertDotEnvValue(configPath, "OPENAI_API_KEY", apiKey.trim());
    printSuccess(`Saved to ${configPath}`);
    blankLine();
  } else {
    process.env.SAVE_SETTINGS = "false";
  }
}

export function explicitImageMode(options: any): RecipeImageMode | null {
  if (options.noImage) return "none";
  if (options.useSourceImage) return "skip";
  if (options.recreateImageWithSourceImages || options.imageReferenceSource) return "generate-with-sources";
  if (options.recreateImage) return "generate";
  return null;
}

export function resolveExcludedModes(targetDevice: "mc" | "tm", options: any): string[] {
  const excludeModes: string[] = options.excludeModes
    ? options.excludeModes.split(",").map((mode: string) => mode.trim())
    : [];

  if (targetDevice === "mc" && !mcHasFoodProcessor() && !excludeModes.includes("foodProcessor")) {
    excludeModes.push("foodProcessor");
  }

  if (targetDevice === "tm" && !(options.extendTmModes || options.experimentalTmModes) && !excludeModes.includes("cook")) {
    excludeModes.push("cook");
  }

  return excludeModes;
}

export async function decideUpload(
  options: any,
  isInteractive: boolean,
  adapter: any
): Promise<{ shouldUpload: boolean; prompted: boolean }> {
  if (options.dryRun) return { shouldUpload: false, prompted: false };
  if (options.alwaysUpload) return { shouldUpload: true, prompted: false };
  if (!isInteractive) return { shouldUpload: false, prompted: false };

  blankLine();
  return {
    prompted: true,
    shouldUpload: await confirm({
      message: `  Upload this recipe to ${adapter.deviceName}?`,
      default: false
    })
  };
}

export async function resolveImageProvider(
  initialMode: RecipeImageMode | null,
  generated: GenerateSmartRecipeResult,
  isInteractive: boolean,
  options: any,
  logger: SmartRecipeLogger,
  spinnerEnabled = false
): Promise<{ imageMode: RecipeImageMode; imageProvider: any; prompted: boolean }> {
  const imageMode = await resolveImageMode(initialMode, generated, isInteractive);
  const imageProvider = createImageProvider(imageMode, options, logger);
  return {
    imageMode,
    imageProvider: imageProvider && imageMode.startsWith("generate") && spinnerEnabled
      ? new SpinnerRecipeImageProvider(imageProvider)
      : imageProvider,
    prompted: initialMode === null && isInteractive
  };
}

function normalizeDeviceOption(value: string): "mc" | "tm" {
  const normalized = value.toLowerCase();
  return normalized === "tm" || normalized === "thermomix" ? "tm" : "mc";
}

async function selectTargetDevice(): Promise<"mc" | "tm"> {
  return await select({
    message: "Which smart cooker do you want to target?",
    choices: [
      { name: "Monsieur Cuisine (MC)", value: "mc" as const },
      { name: "Thermomix (TM)", value: "tm" as const }
    ]
  });
}

async function selectThermomixVersion(): Promise<"tm7" | "tm6" | "tm5"> {
  return await select({
    message: "Which Thermomix model do you own?",
    choices: [
      { name: "TM7", value: "tm7" as const },
      { name: "TM6", value: "tm6" as const },
      { name: "TM5", value: "tm5" as const }
    ]
  });
}

async function promptAndPersistInitialDeviceSettings(device: "mc" | "tm", configPath: string): Promise<void> {
  let tmVersion: "tm7" | "tm6" | "tm5" | undefined;
  if (device === "tm") {
    tmVersion = await selectThermomixVersion();
  }

  let hasFoodProcessor: boolean | undefined;
  if (device === "mc" && typeof process.env.MC_HAS_FOOD_PROCESSOR === "undefined") {
    hasFoodProcessor = await promptForMcFoodProcessor();
  }

  const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
    message: "Save these cooker settings to ~/.smart-recipe?",
    default: true
  });
  if (saveSettings) {
    upsertDotEnvValue(configPath, "TARGET_DEVICE", device);
    if (tmVersion) {
      upsertDotEnvValue(configPath, "TM_VERSION", tmVersion);
    }
    if (hasFoodProcessor !== undefined) {
      upsertDotEnvValue(configPath, "MC_HAS_FOOD_PROCESSOR", String(hasFoodProcessor));
    }
    printSuccess(`Saved device settings to ${configPath}`);
    blankLine();
  } else {
    process.env.SAVE_SETTINGS = "false";
  }

  if (tmVersion) {
    process.env.TM_VERSION = tmVersion;
  }
  if (hasFoodProcessor !== undefined) {
    process.env.MC_HAS_FOOD_PROCESSOR = String(hasFoodProcessor);
  }
  process.env.TARGET_DEVICE = device;
}

async function ensureDeviceSpecificSettings(device: "mc" | "tm", isInteractive: boolean, configPath: string): Promise<boolean> {
  if (device === "tm" && !process.env.TM_VERSION) {
    await ensureThermomixVersion(isInteractive, configPath);
    return isInteractive;
  }

  if (device === "mc" && typeof process.env.MC_HAS_FOOD_PROCESSOR === "undefined") {
    await ensureMcFoodProcessorSetting(isInteractive, configPath);
    return isInteractive;
  }

  return false;
}

async function ensureThermomixVersion(isInteractive: boolean, configPath: string): Promise<void> {
  if (!isInteractive) {
    process.env.TM_VERSION = "tm6";
    return;
  }

  const tmVersion = await selectThermomixVersion();
  const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
    message: "Save this Thermomix model to ~/.smart-recipe?",
    default: true
  });
  if (saveSettings) {
    upsertDotEnvValue(configPath, "TM_VERSION", tmVersion);
    printSuccess(`Saved TM_VERSION to ${configPath}`);
    blankLine();
  } else {
    process.env.SAVE_SETTINGS = "false";
  }
  process.env.TM_VERSION = tmVersion;
}

async function ensureMcFoodProcessorSetting(isInteractive: boolean, configPath: string): Promise<void> {
  if (!isInteractive) {
    process.env.MC_HAS_FOOD_PROCESSOR = "false";
    return;
  }

  const hasFoodProcessor = await promptForMcFoodProcessor();
  const saveSettings = process.env.SAVE_SETTINGS !== "false" && await confirm({
    message: "Save this setting to ~/.smart-recipe?",
    default: true
  });
  if (saveSettings) {
    upsertDotEnvValue(configPath, "MC_HAS_FOOD_PROCESSOR", String(hasFoodProcessor));
    printSuccess(`Saved MC_HAS_FOOD_PROCESSOR to ${configPath}`);
    blankLine();
  } else {
    process.env.SAVE_SETTINGS = "false";
  }
  process.env.MC_HAS_FOOD_PROCESSOR = String(hasFoodProcessor);
}

async function promptForMcFoodProcessor(): Promise<boolean> {
  return await confirm({
    message: "Do you own the optional Food Processor (cutter) attachment for Monsieur Cuisine?",
    default: false
  });
}

async function resolveImageMode(
  imageMode: RecipeImageMode | null,
  generated: GenerateSmartRecipeResult,
  isInteractive: boolean
): Promise<RecipeImageMode> {
  if (imageMode !== null) return imageMode;
  if (!isInteractive) return "skip";

  const sourceImageCount = generated.page.images?.filter((img: any) => img.score >= 0.5).length ?? 0;
  const sourceHint = sourceImageCount > 0
    ? `  ${colorDim(`(${sourceImageCount} potential recipe image${sourceImageCount !== 1 ? "s" : ""} found on the source page)`)}`
    : `  ${colorDim("(no suitable source images found on the page)")}`;
  console.log(sourceHint);
  blankLine();

  return await select<RecipeImageMode>({
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
}

function createImageProvider(
  imageMode: RecipeImageMode,
  options: any,
  logger: SmartRecipeLogger
) {
  if (imageMode === "none") return new NullImageProvider();
  if (imageMode === "skip") return undefined;
  return new OpenAIRecipeImageGenerator({
    model: options.imageModel,
    size: options.imageSize,
    quality: options.imageQuality,
    includeSourceImages: imageMode === "generate-with-sources",
    logger,
  });
}

class SpinnerRecipeImageProvider<TRecipe> implements RecipeImageProvider<TRecipe> {
  constructor(private readonly inner: RecipeImageProvider<TRecipe>) {}

  async getImage(page: RetrievedRecipePage, recipe: TRecipe): Promise<RecipeImageAsset | undefined> {
    return await withCliSpinner(
      "Generating recipe image with OpenAI...",
      true,
      () => this.inner.getImage(page, recipe),
      {
        successMessage: "Generated recipe image.",
        failureMessage: "Recipe image generation failed.",
      }
    );
  }
}

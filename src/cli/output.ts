import process from "node:process";
import { AuthFlowError, MonsieurCuisineApiError } from "../mc/errors.js";
import { CookidooError } from "../devices/tm/errors.js";
import type { importRecipeFromUrl } from "../pipeline/import-url.js";
import { colorCyan, colorDim } from "./terminal.js";

export function printOutput(value: any, isJson: boolean, customFormat?: (val: any) => string): void {
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

export function printSuggestedCommand(
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
    console.log(`\n  ${colorDim("Next time, in order to pick these settings, execute with:")}`);
    console.log(`  ${colorCyan(`$ ${cmdStr}`)}\n`);
  }
}

export function summarizeImportResult(result: Awaited<ReturnType<typeof importRecipeFromUrl>>) {
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

export function printableImportResult(result: Awaited<ReturnType<typeof importRecipeFromUrl>>) {
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

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

export interface CliErrorFormatOptions {
  debug?: boolean;
}

export function formatCliError(error: unknown, options: CliErrorFormatOptions = {}): string {
  if (error instanceof MonsieurCuisineApiError) return formatMonsieurCuisineApiError(error, options);
  if (error instanceof AuthFlowError) return formatAuthFlowError(error, options);
  if (error instanceof CookidooError) return formatCookidooError(error, options);
  return formatGenericCliError(error, options);
}

function formatMonsieurCuisineApiError(error: MonsieurCuisineApiError, options: CliErrorFormatOptions): string {
  return withDebug([
    errorHeader("Monsieur Cuisine request failed"),
    error.message,
    error.status === undefined ? undefined : `Status: ${error.status}`,
    error.code === undefined ? undefined : `Code: ${error.code}`,
    error.endpoint === undefined ? undefined : `Endpoint: ${error.endpoint}`,
    debugHint(options),
  ], error, options, error.response);
}

function formatAuthFlowError(error: AuthFlowError, options: CliErrorFormatOptions): string {
  return withDebug([
    errorHeader("Authentication failed"),
    error.message,
    `Code: ${error.code}`,
    debugHint(options),
  ], error, options, error.response);
}

function formatCookidooError(error: CookidooError, options: CliErrorFormatOptions): string {
  return withDebug([
    errorHeader("Cookidoo request failed"),
    error.message,
    error.status === undefined ? undefined : `Status: ${error.status}`,
    error.method === undefined ? undefined : `Method: ${error.method}`,
    error.url === undefined ? undefined : `URL: ${error.url}`,
    debugHint(options),
  ], error, options, error.body);
}

function formatGenericCliError(error: unknown, options: CliErrorFormatOptions): string {
  const plain = error instanceof Error ? error.message : String(error);
  const message = options.debug && error instanceof Error && error.stack ? error.stack : plain;
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

  if (suggestions.length === 0) return `${errorHeader("Command failed")}\n${message}`;
  return [
    errorHeader("Command failed"),
    message,
    "",
    `${ansi.bold}Suggested next steps:${ansi.reset}`,
    ...suggestions.map((suggestion) => `- ${suggestion}`)
  ].join("\n");
}

function errorHeader(message: string): string {
  return `${ansi.red}✗ ${ansi.bold}${message}${ansi.reset}`;
}

function debugHint(options: CliErrorFormatOptions): string | undefined {
  return options.debug ? undefined : `${ansi.dim}Run again with --debug for response details and stack trace.${ansi.reset}`;
}

function withDebug(
  lines: Array<string | undefined>,
  error: Error,
  options: CliErrorFormatOptions,
  response?: unknown
): string {
  const visible = lines.filter(Boolean) as string[];
  if (!options.debug) return visible.join("\n");
  return [
    ...visible,
    response === undefined ? undefined : "",
    response === undefined ? undefined : `${ansi.yellow}Response:${ansi.reset}`,
    response === undefined ? undefined : JSON.stringify(response, null, 2),
    error.stack ? "" : undefined,
    error.stack,
  ].filter(Boolean).join("\n");
}

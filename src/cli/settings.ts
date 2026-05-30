import process from "node:process";
import { getTmCookie, getTmLocale, upsertDotEnvValue } from "../config/env.js";
import { supportedLocales } from "../catalogs/index.js";
import type { SupportedLocale } from "../catalogs/types.js";
import type { RecipeSource } from "../sources/index.js";
import { confirm, select } from "./prompts.js";
import { blankLine, printSuccess } from "./terminal.js";

export function cookieKeyForDevice(device: "mc" | "tm"): "MC_COOKIE" | "TM_COOKIE" {
  return device === "tm" ? "TM_COOKIE" : "MC_COOKIE";
}

export function activeCookieForDevice(device: "mc" | "tm", options: any): string | undefined {
  if (options.cookie) return options.cookie;
  return device === "tm" ? getTmCookie() : process.env.MC_COOKIE;
}

export async function getOrPromptDevice(
  options: any,
  isInteractive: boolean,
  configPath: string
): Promise<"mc" | "tm"> {
  let device = options.device || process.env.TARGET_DEVICE;
  if (!device) {
    if (isInteractive) {
      blankLine();
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
        upsertDotEnvValue(configPath, "TARGET_DEVICE", device);
        printSuccess(`Saved TARGET_DEVICE to ${configPath}`);
        blankLine();
      } else {
        process.env.SAVE_SETTINGS = "false";
      }
    } else {
      device = "mc";
    }
  }
  const val = device.toLowerCase();
  return (val === "tm" || val === "thermomix") ? "tm" : "mc";
}

export function sourceCookiesFromOptions(options: any, detectedSource?: RecipeSource): { mc?: string; tm?: string } {
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

export function sourceLocaleFromOptions(options: any, detectedSource: RecipeSource): string {
  if (options.sourceLocale) return normalizeSupportedLocale(options.sourceLocale) ?? options.sourceLocale;
  if ("locale" in detectedSource && detectedSource.locale) return detectedSource.locale;
  const sourceDevice = sourceDeviceForType(detectedSource.type);
  if (sourceDevice === "tm") return normalizeSupportedLocale(getTmLocale("de-DE")) ?? getTmLocale("de-DE");
  if (sourceDevice === "mc") return normalizeSupportedLocale(process.env.MC_LOCALE) ?? process.env.MC_LOCALE ?? "de-DE";
  return normalizeSupportedLocale(options.locale ?? options.language) ?? options.locale ?? options.language ?? "de-DE";
}

export function sourceDeviceForType(sourceType: RecipeSource["type"]): "mc" | "tm" | null {
  if (sourceType === "mc") return "mc";
  if (sourceType === "cookidoo-official" || sourceType === "cookidoo-created") return "tm";
  return null;
}

export async function getOrPromptTargetLocale(
  targetDevice: "mc" | "tm",
  options: any,
  isInteractive: boolean,
  configPath: string
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
    upsertDotEnvValue(configPath, localeKey, selectedLocale);
    printSuccess(`Saved ${localeKey} to ${configPath}`);
    blankLine();
  } else {
    process.env.SAVE_SETTINGS = "false";
  }
  process.env[localeKey] = selectedLocale;
  return { locale: selectedLocale, prompted: true };
}

export function normalizeSupportedLocale(value: unknown): SupportedLocale | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const alias = localeAliases[normalized.toLowerCase()];
  if (alias) return alias;
  return (supportedLocales as readonly string[]).includes(normalized)
    ? normalized as SupportedLocale
    : undefined;
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

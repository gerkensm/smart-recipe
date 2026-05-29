import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(filePath = ".env", { override = false } = {}): Record<string, string> {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return {};

  const loaded: Record<string, string> = {};
  const text = fs.readFileSync(absolute, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    loaded[key] = value;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return loaded;
}

export function envString(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export function upsertDotEnvValue(filePath: string, key: string, value: string): void {
  const absolute = path.resolve(filePath);
  const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
  const lines = text ? text.split(/\r?\n/) : [];
  const encoded = quoteDotEnvValue(value);
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}\\s*=`);
  let replaced = false;

  const nextLines = lines.map((line) => {
    if (!pattern.test(line)) return line;
    replaced = true;
    return `${key}=${encoded}`;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
    nextLines.push(`${key}=${encoded}`);
  }

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${nextLines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
  process.env[key] = value;
}

function quoteDotEnvValue(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function getTargetDevice(fallback: "mc" | "tm" = "mc"): "mc" | "tm" {
  const val = (process.env.TARGET_DEVICE ?? "").trim().toLowerCase();
  if (val === "tm" || val === "thermomix") return "tm";
  if (val === "mc" || val === "monsieurcuisine") return "mc";
  return fallback;
}

export function getTmVersion(fallback: "tm6" | "tm5" | "tm7" = "tm6"): "tm6" | "tm5" | "tm7" {
  const val = (process.env.TM_VERSION ?? "").trim().toLowerCase();
  if (val === "tm5") return "tm5";
  if (val === "tm6") return "tm6";
  if (val === "tm7") return "tm7";
  return fallback;
}

export function getTmLocale(fallback = "de-DE"): string {
  return (process.env.TM_LOCALE ?? fallback).trim();
}

export function getTmCookie(): string | undefined {
  return process.env.TM_COOKIE || process.env.TM_COOKIES;
}

export function mcHasFoodProcessor(): boolean {
  const val = (process.env.MC_HAS_FOOD_PROCESSOR ?? "").trim().toLowerCase();
  return val === "true";
}


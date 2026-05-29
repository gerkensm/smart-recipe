import type { RecipeSource } from "./types.js";

const COOKIDOO_OFFICIAL_ID_RE = /^r\d+$/i;
const COOKIDOO_CREATED_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function detectRecipeSource(input: string, options: { source?: "web" | "mc" | "cookidoo" | "tm" } = {}): RecipeSource {
  const value = normalizeCliUrl(input);
  const sourceHint = options.source;

  if (sourceHint === "mc") {
    return { type: "mc", id: extractMcId(value) ?? value, url: value.startsWith("http") ? value : undefined };
  }

  if (sourceHint === "cookidoo" || sourceHint === "tm") {
    return detectCookidooSource(value);
  }

  if (COOKIDOO_OFFICIAL_ID_RE.test(value) || COOKIDOO_CREATED_ID_RE.test(value)) {
    return detectCookidooSource(value);
  }

  if (!looksLikeUrl(value)) {
    return { type: "web", url: value };
  }

  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host.includes("cookidoo") || host.includes("tmmobile.vorwerk-digital.com")) {
    return detectCookidooSource(value);
  }
  if (host.includes("monsieur-cuisine.com")) {
    const id = extractMcId(value);
    if (id) return { type: "mc", id, url: value };
  }
  return { type: "web", url: value };
}

function normalizeCliUrl(input: string): string {
  return input.trim().replace(/\\([?=&])/g, "$1");
}

function detectCookidooSource(value: string): RecipeSource {
  if (!looksLikeUrl(value)) {
    return COOKIDOO_OFFICIAL_ID_RE.test(value)
      ? { type: "cookidoo-official", id: value }
      : { type: "cookidoo-created", id: value };
  }

  const url = new URL(value);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const recipeId = [...pathParts].reverse().find((part) =>
    COOKIDOO_OFFICIAL_ID_RE.test(part) || COOKIDOO_CREATED_ID_RE.test(part)
  );
  if (!recipeId) return { type: "web", url: value };

  const locale = pathParts.find((part) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(part));
  if (COOKIDOO_OFFICIAL_ID_RE.test(recipeId)) {
    return { type: "cookidoo-official", id: recipeId, locale, url: value };
  }
  return {
    type: "cookidoo-created",
    id: recipeId,
    public: url.pathname.includes("/public/"),
    locale,
    url: value,
  };
}

function extractMcId(value: string): string | null {
  if (!looksLikeUrl(value)) return /^\d+$/.test(value) ? value : null;
  const url = new URL(value);
  return url.searchParams.get("recipe-id") ?? url.searchParams.get("recipeId");
}

function looksLikeUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

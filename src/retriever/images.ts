import * as cheerio from "cheerio";
import type { RetrievedImage } from "./types.js";

export function findRecipeImageCandidates(html: string, pageUrl: string, maxImages = 3): RetrievedImage[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, RetrievedImage>();

  function add(url: string | undefined, score: number, reason: string, width?: number, height?: number): void {
    if (!url) return;
    const absolute = normalizeImageUrl(url, pageUrl);
    if (!absolute) return;
    const existing = candidates.get(absolute);
    if (!existing || score > existing.score) {
      candidates.set(absolute, {
        url: absolute,
        contentType: contentTypeFromUrl(absolute),
        score,
        reason,
        width,
        height
      });
    }
  }

  add($("meta[property='og:image']").attr("content"), 100, "OpenGraph image");
  add($("meta[name='twitter:image']").attr("content"), 95, "Twitter card image");
  add($("link[rel='image_src']").attr("href"), 90, "image_src link");

  $("script[type='application/ld+json']").each((_, element) => {
    const text = $(element).text();
    try {
      const json = JSON.parse(text);
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes.flatMap(expandGraph)) {
        if (!node || typeof node !== "object") continue;
        const type = String((node as { "@type"?: string })["@type"] ?? "").toLowerCase();
        if (!type.includes("recipe")) continue;
        const image = (node as { image?: unknown }).image;
        if (Array.isArray(image)) image.forEach((item) => add(imageUrlFromJsonLd(item), 98, "Recipe JSON-LD image"));
        else add(imageUrlFromJsonLd(image), 98, "Recipe JSON-LD image");
      }
    } catch {
      // Ignore invalid site JSON-LD.
    }
  });

  $("img").each((_, element) => {
    const src = $(element).attr("src") || $(element).attr("data-src") || $(element).attr("data-lazy-src");
    const alt = ($(element).attr("alt") ?? "").toLowerCase();
    const cls = ($(element).attr("class") ?? "").toLowerCase();
    const width = numberAttr($(element).attr("width"));
    const height = numberAttr($(element).attr("height"));
    let score = 20;
    if (alt.includes("recipe") || alt.includes("rezept")) score += 15;
    if (cls.includes("recipe") || cls.includes("hero") || cls.includes("main")) score += 20;
    if ((width ?? 0) >= 400 || (height ?? 0) >= 300) score += 10;
    add(src, score, "HTML image", width, height);
  });

  return [...candidates.values()]
    .filter((image) => !/sprite|logo|icon|avatar|placeholder/i.test(image.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxImages);
}

export async function hydrateImages(
  images: RetrievedImage[],
  options: { fetchImpl?: typeof fetch; maxBytes?: number } = {}
): Promise<RetrievedImage[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const hydrated: RetrievedImage[] = [];
  for (const image of images) {
    try {
      const response = await fetchImpl(image.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      // Strip parameters (e.g. "; charset=utf-8" or ";q=0.9") and normalise to bare MIME type.
      const rawContentType = response.headers.get("content-type") ?? image.contentType;
      const contentType = rawContentType.split(";")[0].trim();
      if (!RETRIEVER_SUPPORTED_IMAGE_TYPES.has(contentType)) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) continue;
      const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
      hydrated.push({ ...image, contentType, bytes, dataUrl });
    } catch {
      // Keep retrieval robust; broken image candidates are common.
    }
  }
  return hydrated;
}

/** Image MIME types accepted by the OpenAI responses API for vision inputs. */
const RETRIEVER_SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function normalizeImageUrl(url: string, pageUrl: string): string | null {
  const first = url.split(",")[0]?.trim().split(/\s+/)[0];
  if (!first || first.startsWith("data:")) return null;
  try {
    return new URL(first, pageUrl).toString();
  } catch {
    return null;
  }
}

function contentTypeFromUrl(url: string): string {
  if (/\.png(?:\?|$)/i.test(url)) return "image/png";
  if (/\.webp(?:\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

function imageUrlFromJsonLd(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value) return String((value as { url: unknown }).url);
  return undefined;
}

function expandGraph(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [value];
  const graph = (value as { "@graph"?: unknown })["@graph"];
  return Array.isArray(graph) ? graph : [value];
}

function numberAttr(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

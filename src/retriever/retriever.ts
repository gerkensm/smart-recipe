import type { RetrievedRecipePage, RetrieveRecipePageOptions } from "./types.js";
import { findRecipeImageCandidates, hydrateImages } from "./images.js";
import { htmlToMarkdown } from "./markdown.js";
import { extractJsonLd, findRecipeObjects, formatRecipeJsonLd } from "./json-ld.js";

export class RecipePageRetriever {
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(private readonly options: RetrieveRecipePageOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.userAgent = options.userAgent ?? "Mozilla/5.0";
  }

  async retrieve(url: string): Promise<RetrievedRecipePage> {
    const response = await this.fetchImpl(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`Recipe page HTTP ${response.status}: ${url}`);
    const html = await response.text();
    const finalUrl = response.url || url;
    const converted = await htmlToMarkdown(html, finalUrl);
    const maxImages = this.options.maxImages ?? 3;
    const imageCandidates = findRecipeImageCandidates(html, finalUrl, maxImages);
    const images = this.options.includeImageBytes ?? true
      ? await hydrateImages(imageCandidates, {
        fetchImpl: this.fetchImpl,
        maxBytes: this.options.maxImageBytes
      })
      : imageCandidates;
    const maxMarkdownChars = this.options.maxMarkdownChars ?? 200000;

    const jsonLd = extractJsonLd(html);
    const recipeObjects = findRecipeObjects(jsonLd);
    let markdown = converted.markdown.slice(0, maxMarkdownChars);

    if (recipeObjects.length > 0) {
      const structuredMarkdown = recipeObjects.map(formatRecipeJsonLd).join("\n\n---\n\n");
      markdown += `\n\n${structuredMarkdown}`;
    }

    return {
      url,
      finalUrl,
      html,
      title: converted.title,
      markdown,
      images
    };
  }
}

export async function retrieveRecipePage(url: string, options?: RetrieveRecipePageOptions): Promise<RetrievedRecipePage> {
  return new RecipePageRetriever(options).retrieve(url);
}

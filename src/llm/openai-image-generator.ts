import { Buffer } from "node:buffer";
import OpenAI, { toFile } from "openai";
import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedImage, RetrievedRecipePage } from "../retriever/types.js";
import type { RecipeImageAsset, RecipeImageProvider } from "../pipeline/images.js";
import { silentLogger, type SmartRecipeLogger } from "../logging/logger.js";
import { buildRecipeImagePrompt } from "./prompts.js";

export interface OpenAIRecipeImageGeneratorOptions {
  client?: OpenAI;
  model?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  outputFormat?: "jpeg" | "png" | "webp";
  includeSourceImages?: boolean;
  maxSourceImages?: number;
  logger?: SmartRecipeLogger;
}

export class OpenAIRecipeImageGenerator implements RecipeImageProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly size: string;
  private readonly quality: "low" | "medium" | "high" | "auto";
  private readonly outputFormat: "jpeg" | "png" | "webp";
  private readonly includeSourceImages: boolean;
  private readonly maxSourceImages: number;
  private readonly logger: SmartRecipeLogger;

  constructor(options: OpenAIRecipeImageGeneratorOptions = {}) {
    this.client = options.client ?? new OpenAI();
    this.model = options.model ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    this.size = options.size ?? process.env.OPENAI_IMAGE_SIZE ?? "1024x1024";
    this.quality = options.quality ?? (process.env.OPENAI_IMAGE_QUALITY as any) ?? "medium";
    this.outputFormat = options.outputFormat ?? "jpeg";
    this.includeSourceImages = options.includeSourceImages ?? false;
    this.maxSourceImages = options.maxSourceImages ?? 3;
    this.logger = options.logger ?? silentLogger;
  }

  async getImage(page: RetrievedRecipePage, recipe: RecipeInput): Promise<RecipeImageAsset> {
    const prompt = buildRecipeImagePrompt(page, recipe);
    const sourceImages = this.includeSourceImages
      ? page.images.filter(hasImageBytes).slice(0, this.maxSourceImages)
      : [];
    const mode = sourceImages.length > 0 ? "edit" : "generate";

    this.logger.info({
      model: this.model,
      size: this.size,
      quality: this.quality,
      outputFormat: this.outputFormat,
      mode,
      sourceImages: sourceImages.length
    }, "generating recipe image");

    const response = sourceImages.length > 0
      ? await this.client.images.edit({
        model: this.model,
        image: await Promise.all(sourceImages.map((image, index) => toOpenAIFile(image, index))),
        prompt,
        n: 1,
        size: this.size,
        quality: this.quality,
        output_format: this.outputFormat,
        background: "opaque"
      })
      : await this.client.images.generate({
        model: this.model,
        prompt,
        n: 1,
        size: this.size,
        quality: this.quality,
        output_format: this.outputFormat,
        background: "opaque"
      });

    this.logger.debug({ mode, images: response.data?.length ?? 0 }, "received OpenAI image response");
    const image = response.data?.[0];
    const bytes = image?.b64_json
      ? Buffer.from(image.b64_json, "base64")
      : image?.url
        ? await fetchImageBytes(image.url)
        : undefined;
    if (!bytes) throw new Error("OpenAI image generation returned no image bytes.");
    this.logger.info({
      model: this.model,
      mode,
      bytes: bytes.byteLength,
      contentType: contentTypeForOutputFormat(this.outputFormat)
    }, "generated recipe image");

    return {
      bytes,
      contentType: contentTypeForOutputFormat(this.outputFormat),
      source: "generated",
      description: "OpenAI recreated recipe image"
    };
  }
}

function hasImageBytes(image: RetrievedImage): image is RetrievedImage & { bytes: Uint8Array } {
  return Boolean(image.bytes && image.contentType.startsWith("image/"));
}

async function toOpenAIFile(image: RetrievedImage & { bytes: Uint8Array }, index: number): Promise<File> {
  const ext = extensionForContentType(image.contentType);
  return toFile(Buffer.from(image.bytes), `source-${index + 1}.${ext}`, { type: image.contentType });
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`OpenAI generated image URL HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function contentTypeForOutputFormat(format: "jpeg" | "png" | "webp"): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

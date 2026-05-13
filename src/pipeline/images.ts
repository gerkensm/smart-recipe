import type { RecipeInput } from "../recipes/schema.js";
import type { RetrievedRecipePage } from "../retriever/types.js";

export interface RecipeImageAsset {
  bytes: Uint8Array;
  contentType: string;
  source: "retrieved" | "generated";
  sourceUrl?: string;
  description?: string;
}

export interface RecipeImageProvider {
  getImage(page: RetrievedRecipePage, recipe: RecipeInput): Promise<RecipeImageAsset | undefined>;
}

export class RetrievedRecipeImageProvider implements RecipeImageProvider {
  async getImage(page: RetrievedRecipePage): Promise<RecipeImageAsset | undefined> {
    const firstImage = page.images.find((image) => image.bytes && image.contentType.startsWith("image/"));
    if (!firstImage?.bytes) return undefined;
    return {
      bytes: firstImage.bytes,
      contentType: firstImage.contentType,
      source: "retrieved",
      sourceUrl: firstImage.url,
      description: firstImage.reason
    };
  }
}

import { CookidooClient } from "./client.js";
import type { CookidooPayload } from "./payload.js";
import type {
  CookidooCreatedRecipe,
  CookidooImageUploadResult,
  CookidooProfile,
  CookidooRecipeCreateResult,
  CookidooRecipeListResult,
  CookidooRecipeSummary,
} from "./types.js";

export interface CookidooApiOptions {
  cookie: string;
  locale?: string;
  fetch?: typeof fetch;
}

export interface ListCreatedRecipesOptions {
  page?: number;
  size?: number;
}

export interface CreateRecipeFromPayloadOptions {
  baseRecipePublicId?: string;
  servingSize?: number;
}

const DEFAULT_PUBLIC_BASE_RECIPE_ID = "01KB04WSJP4SHNBKJK4H4FT0PZ";

export class CookidooApi {
  readonly client: CookidooClient;

  constructor(options: CookidooApiOptions) {
    this.client = new CookidooClient({
      cookie: options.cookie,
      locale: options.locale ?? "de-DE",
      fetch: options.fetch,
    });
  }

  get domain(): string {
    return this.client.domain;
  }

  get language(): string {
    return this.client.language;
  }

  getProfile(): Promise<CookidooProfile> {
    return this.client.request<CookidooProfile>({
      method: "GET",
      path: "/community/profile",
      accept: "application/json",
    });
  }

  async listCreatedRecipes(options: ListCreatedRecipesOptions = {}): Promise<CookidooRecipeListResult> {
    const res = await this.client.request<any>({
      method: "GET",
      path: `/created-recipes/${this.language}`,
    });
    const candidateRecipes = Array.isArray(res) ? res : res?.items ?? res?.data ?? [];
    const allRecipes = Array.isArray(candidateRecipes) ? candidateRecipes : [];
    const size = options.size && options.size > 0 ? options.size : allRecipes.length;
    const page = options.page && options.page > 0 ? options.page : 1;
    const start = (page - 1) * size;
    const recipes = allRecipes.slice(start, start + size).map((recipe: any) => this.toSummary(recipe));

    return {
      total: allRecipes.length,
      totalPage: size > 0 ? Math.max(1, Math.ceil(allRecipes.length / size)) : 1,
      recipes,
      raw: res,
    };
  }

  getCreatedRecipe(id: string): Promise<CookidooCreatedRecipe> {
    return this.client.request<CookidooCreatedRecipe>({
      method: "GET",
      path: `/created-recipes/${this.language}/${encodeURIComponent(id)}`,
    });
  }

  getPublicCreatedRecipe(id: string): Promise<CookidooCreatedRecipe> {
    return this.client.request<CookidooCreatedRecipe>({
      method: "GET",
      path: `/created-recipes/public/recipes/${this.language}/${encodeURIComponent(id)}`,
    });
  }

  getOfficialRecipe(id: string): Promise<any> {
    return this.client.request<any>({
      method: "GET",
      path: `/recipes/recipe/${this.language}/${encodeURIComponent(id)}`,
      accept: "application/json",
    });
  }

  async copyPublicRecipe(publicIdOrUrl: string, servingSize = 1): Promise<CookidooCreatedRecipe> {
    const recipeUrl = publicIdOrUrl.startsWith("http")
      ? publicIdOrUrl
      : `https://${this.domain}/created-recipes/public/recipes/${this.language}/${publicIdOrUrl}`;
    return this.client.request<CookidooCreatedRecipe>({
      method: "POST",
      path: `/created-recipes/${this.language}`,
      body: {
        recipeUrl,
        servingSize,
      },
    });
  }

  patchRecipeMeta(id: string, meta: CookidooPayload["meta"]): Promise<CookidooCreatedRecipe> {
    return this.client.request<CookidooCreatedRecipe>({
      method: "PATCH",
      path: `/created-recipes/${this.language}/${encodeURIComponent(id)}`,
      body: meta,
    });
  }

  patchRecipeInstructions(id: string, instructions: CookidooPayload["instructions"]): Promise<CookidooCreatedRecipe> {
    return this.client.request<CookidooCreatedRecipe>({
      method: "PATCH",
      path: `/created-recipes/${this.language}/${encodeURIComponent(id)}`,
      body: { instructions },
    });
  }

  async createRecipeFromPayload(
    payload: CookidooPayload,
    options: CreateRecipeFromPayloadOptions = {}
  ): Promise<CookidooRecipeCreateResult> {
    const draft = await this.copyPublicRecipe(
      options.baseRecipePublicId ?? DEFAULT_PUBLIC_BASE_RECIPE_ID,
      options.servingSize ?? payload.meta.yield?.value ?? 1
    );
    const id = draft.recipeId;
    await this.patchRecipeMeta(id, payload.meta);
    const recipe = await this.patchRecipeInstructions(id, payload.instructions);
    return {
      recipe,
      recipeUrl: `https://${this.domain}/created-recipes/${this.language}/${id}`,
    };
  }

  async requestImageSignature(options: {
    timestamp: number;
    source: string;
    customCoordinates: string;
    uploadPreset?: string;
  }): Promise<{ signature: string }> {
    return this.client.requestImageSignature(options);
  }

  uploadImageToCloudinary(options: {
    fileBytes: Uint8Array;
    mimeType: string;
    timestamp: number;
    signature: string;
    source: string;
    customCoordinates: string;
  }): Promise<CookidooImageUploadResult> {
    return this.client.uploadImageToCloudinary(options);
  }

  private toSummary(recipe: CookidooCreatedRecipe): CookidooRecipeSummary {
    const content = recipe.recipeContent ?? {};
    const id = recipe.recipeId;
    return {
      id,
      title: content.name ?? "",
      status: recipe.status,
      workStatus: recipe.workStatus,
      updatedAt: recipe.modifiedAt ?? recipe.createdAt,
      createdAt: recipe.createdAt,
      tools: content.tools ?? content.tool,
      ingredientCount: content.ingredients?.length,
      stepCount: content.instructions?.length,
      hasImage: Boolean(content.image || content.descriptiveAssets?.length),
      hasHints: Boolean(content.hints),
      recipeUrl: id ? `https://${this.domain}/created-recipes/${this.language}/${id}` : undefined,
    };
  }
}

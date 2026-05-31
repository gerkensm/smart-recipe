import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Type, { type TSchema } from "typebox";
import { createRecipeUrl } from "./urls.js";
import { MonsieurCuisineApiError } from "./errors.js";
import type { AuthProvider } from "./auth.js";
import type { SmartRecipeLogger } from "../logging/logger.js";
import { silentLogger } from "../logging/logger.js";
import type { SmartRecipePayload } from "../recipes/types.js";
import { assertSmartRecipePayload } from "../recipes/validation.js";
import type { SupportedLocale } from "../catalogs/types.js";
import { validateApiResponse } from "../devices/response-validation.js";

export interface MonsieurCuisineSmartClientOptions {
  cookie?: string;
  authProvider?: AuthProvider;
  locale?: SupportedLocale;
  baseUrl?: string;
  publicApiBaseUrl?: string;
  proxyBypass?: string;
  fetch?: typeof fetch;
  logger?: SmartRecipeLogger;
}

export interface ProxyOptions {
  endpoint: string;
  method?: string;
  payload?: unknown;
  locale?: SupportedLocale;
  referer?: string;
}

export const MONSIEUR_CUISINE_BASE_URL = "https://www.monsieur-cuisine.com";
export const MONSIEUR_CUISINE_PUBLIC_API_BASE_URL = "https://mc-api.tecpal.com";
export const DEFAULT_PROXY_BYPASS = "cd844315-77c4-46ba-83fe-7702d13b12b2";

const McProxyResponseSchema = Type.Object({
  code: Type.Optional(Type.Number()),
  message: Type.Optional(Type.String()),
  data: Type.Optional(Type.Unknown()),
}, { additionalProperties: true });

const McUserResponseSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
}, { additionalProperties: true });

const McDraftListResponseSchema = Type.Object({
  data: Type.Optional(Type.Object({
    recipes: Type.Optional(Type.Array(Type.Object({
      id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
      title: Type.Optional(Type.String()),
    }, { additionalProperties: true }))),
    total: Type.Optional(Type.Number()),
    totalPage: Type.Optional(Type.Number()),
  }, { additionalProperties: true })),
}, { additionalProperties: true });

const McRecipeResponseSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  title: Type.Optional(Type.String()),
}, { additionalProperties: true });

const McRecipeCreateResponseSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
}, { additionalProperties: true });

const McImageUploadUrlResponseSchema = Type.Object({
  url: Type.String(),
  mediaId: Type.Number(),
}, { additionalProperties: true });

const McMediaListResponseSchema = Type.Array(Type.Object({
  id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  url: Type.Optional(Type.String()),
}, { additionalProperties: true }));

export class MonsieurCuisineSmartClient {
  readonly baseUrl: string;
  readonly publicApiBaseUrl: string;
  readonly locale: SupportedLocale;
  private cookie?: string;
  private readonly authProvider?: AuthProvider;
  private readonly proxyBypass: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: SmartRecipeLogger;

  constructor(options: MonsieurCuisineSmartClientOptions = {}) {
    this.cookie = options.cookie;
    this.authProvider = options.authProvider;
    this.locale = options.locale ?? "de-DE";
    this.baseUrl = options.baseUrl ?? MONSIEUR_CUISINE_BASE_URL;
    this.publicApiBaseUrl = options.publicApiBaseUrl ?? MONSIEUR_CUISINE_PUBLIC_API_BASE_URL;
    this.proxyBypass = options.proxyBypass ?? DEFAULT_PROXY_BYPASS;
    this.fetchImpl = options.fetch ?? fetch;
    this.logger = options.logger ?? silentLogger;
  }

  setCookie(cookie: string): void {
    this.cookie = cookie;
  }

  async authenticate(): Promise<string> {
    if (this.cookie) return this.cookie;
    if (!this.authProvider) {
      throw new Error("No Monsieur Cuisine cookie or auth provider configured.");
    }
    const session = await this.authProvider.getSession();
    this.cookie = session.cookie;
    this.logger.info({ source: session.source }, "authenticated Monsieur Cuisine session");
    return session.cookie;
  }

  async proxy({ endpoint, method = "GET", payload, locale = this.locale, referer }: ProxyOptions): Promise<any> {
    await this.authenticate();
    this.logger.debug({ endpoint, method, locale }, "calling Monsieur Cuisine proxy");
    const response = await this.fetchImpl(`${this.baseUrl}/proxy-api`, {
      method: "POST",
      headers: this.proxyHeaders(referer),
      credentials: "include",
      body: JSON.stringify({
        endpoint,
        method,
        lang: locale,
        ...(payload === undefined ? {} : { payload })
      })
    });

    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw new MonsieurCuisineApiError(`Monsieur Cuisine proxy HTTP ${response.status}`, {
        status: response.status,
        response: body,
        endpoint
      });
    }
    const validation = validateApiResponse(McProxyResponseSchema, body);
    if (!validation.ok) {
      throw new MonsieurCuisineApiError("Monsieur Cuisine proxy response shape changed", {
        status: response.status,
        response: { errors: validation.errors, body },
        endpoint
      });
    }
    if (body && typeof body === "object" && "code" in body && body.code !== 0) {
      throw new MonsieurCuisineApiError(body.message || `Monsieur Cuisine API code ${body.code}`, {
        status: response.status,
        code: body.code,
        response: body,
        endpoint
      });
    }
    return body;
  }

  async getCurrentUser(): Promise<unknown> {
    const result = await this.proxy({ endpoint: "api/v1/users" });
    const user = result.data?.user ?? result.data ?? result;
    this.assertVendorResponse(McUserResponseSchema, user, "api/v1/users");
    return user;
  }

  async listDrafts({ page = 1, size = 20 } = {}): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("size", String(size));
    params.set("page", String(page));
    params.append("filters[status][]", "draft");
    const result = await this.proxy({
      endpoint: `api/v3/auth/user/recipes?${params.toString()}`,
      referer: createRecipeUrl(this.locale)
    });
    this.assertVendorResponse(McDraftListResponseSchema, result, `api/v3/auth/user/recipes?${params.toString()}`);
    return result;
  }

  async getRecipe(recipeId: string | number): Promise<unknown> {
    const result = await this.proxy({
      endpoint: `api/v3/auth/user/recipes/${recipeId}`,
      referer: this.recipeUrl(Number(recipeId))
    });
    const recipe = result.data?.recipe ?? result.data ?? result;
    this.assertVendorResponse(McRecipeResponseSchema, recipe, `api/v3/auth/user/recipes/${recipeId}`);
    return result;
  }

  async createRecipe(payload: SmartRecipePayload, { locale = payload.languageLocale } = {}): Promise<any> {
    assertSmartRecipePayload(payload);
    const result = await this.proxy({
      endpoint: "api/v3/auth/user/recipes/",
      method: "POST",
      locale,
      payload,
      referer: createRecipeUrl(locale)
    });
    const recipe = result.data?.recipe ?? result.data ?? result;
    this.assertVendorResponse(McRecipeCreateResponseSchema, recipe, "api/v3/auth/user/recipes/");
    return recipe;
  }

  async requestImageUploadUrl({ fileName, mimeType = "image/jpeg", locale = this.locale }: { fileName: string; mimeType?: string; locale?: SupportedLocale }): Promise<{ url: string; mediaId: number }> {
    const result = await this.proxy({
      endpoint: "api/v1/media/image/upload-url",
      method: "POST",
      locale,
      payload: { fileName, mimeType },
      referer: createRecipeUrl(locale)
    });
    const uploadUrl = result.data ?? result;
    this.assertVendorResponse(McImageUploadUrlResponseSchema, uploadUrl, "api/v1/media/image/upload-url");
    return uploadUrl;
  }

  async uploadMediaBytes(uploadUrl: string, bytes: BodyInit, { mimeType = "image/jpeg" } = {}): Promise<true> {
    const response = await this.fetchImpl(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: bytes
    });
    if (!response.ok) {
      throw new MonsieurCuisineApiError(`Media upload HTTP ${response.status}`, {
        status: response.status,
        response: await parseResponseBody(response)
      });
    }
    return true;
  }

  async getMedia(mediaIds: number[], { locale = this.locale } = {}): Promise<any> {
    const query = mediaIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join("&");
    const result = await this.proxy({ endpoint: `api/v1/media?${query}`, locale });
    const media = result.data?.media ?? result.data ?? result;
    this.assertVendorResponse(McMediaListResponseSchema, media, `api/v1/media?${query}`);
    return media;
  }

  async waitForMedia(mediaIds: number[], { locale = this.locale, attempts = 10, delayMs = 1000 } = {}): Promise<unknown[] | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const media = await this.getMedia(mediaIds, { locale });
      if (Array.isArray(media) && media.length === mediaIds.length && media.every((item) => item?.id && item?.url)) {
        return media;
      }
      await delay(delayMs);
    }
    return null;
  }

  async uploadRecipeImage(bytes: BodyInit, options: { locale?: SupportedLocale; mimeType?: string; detailsFileName?: string; thumbnailFileName?: string; waitForProcessing?: boolean } = {}): Promise<{ detailsMediaId: number; thumbnailMediaId: number }> {
    const locale = options.locale ?? this.locale;
    const mimeType = options.mimeType ?? "image/jpeg";
    const ext = mimeType.split("/")[1] || "jpg";
    const detailsFileName = options.detailsFileName ?? `${randomUUID()}_details.${ext}`;
    const thumbnailFileName = options.thumbnailFileName ?? `${randomUUID()}_thumbnail.${ext}`;

    const [details, thumbnail] = await Promise.all([
      this.requestImageUploadUrl({ fileName: detailsFileName, mimeType, locale }),
      this.requestImageUploadUrl({ fileName: thumbnailFileName, mimeType, locale })
    ]);
    await Promise.all([
      this.uploadMediaBytes(details.url, bytes, { mimeType }),
      this.uploadMediaBytes(thumbnail.url, bytes, { mimeType })
    ]);
    if (options.waitForProcessing ?? true) {
      await this.waitForMedia([details.mediaId, thumbnail.mediaId], { locale });
    }
    return { detailsMediaId: details.mediaId, thumbnailMediaId: thumbnail.mediaId };
  }

  recipeUrl(recipeId: number, locale = this.locale): string {
    const url = new URL(createRecipeUrl(locale));
    url.searchParams.set("recipe-id", String(recipeId));
    return url.toString();
  }

  private proxyHeaders(referer?: string): HeadersInit {
    return {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "X-Request-ID": randomUUID(),
      "x-bypass-cdn": this.proxyBypass,
      "device-type": "web",
      "Accept-Language": this.locale,
      Referer: referer ?? createRecipeUrl(this.locale),
      ...(this.cookie ? { Cookie: this.cookie } : {})
    };
  }

  private assertVendorResponse(schema: TSchema, value: unknown, endpoint: string): void {
    const validation = validateApiResponse(schema, value);
    if (!validation.ok) {
      throw new MonsieurCuisineApiError("Monsieur Cuisine API response shape changed", {
        endpoint,
        response: { errors: validation.errors, body: value }
      });
    }
  }
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

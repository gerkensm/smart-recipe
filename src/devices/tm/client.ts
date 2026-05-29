import { CookidooError, CookidooRateLimitError, isRateLimitBody } from "./errors.js";

export interface Localization {
  domain: string;
  language: string;
}

export function getLocalization(locale: string): Localization {
  const norm = locale.trim().toLowerCase();
  if (norm.startsWith("de")) {
    return { domain: "cookidoo.de", language: "de-DE" };
  }
  if (norm.startsWith("fr")) {
    return { domain: "cookidoo.fr", language: "fr-FR" };
  }
  if (norm.startsWith("it")) {
    return { domain: "cookidoo.it", language: "it-IT" };
  }
  if (norm.startsWith("pl")) {
    return { domain: "cookidoo.pl", language: "pl" };
  }
  if (norm.startsWith("cs") || norm.startsWith("cz")) {
    return { domain: "cookidoo.cz", language: "cs" };
  }
  if (norm === "en-us" || norm.startsWith("en_us")) {
    return { domain: "cookidoo.thermomix.com", language: "en-US" };
  }
  // fallback
  return { domain: "cookidoo.international", language: "en" };
}

export const FULL_VIEW_ACCEPT = "application/vnd.vorwerk.customer-recipe.full+json";

export interface CookidooRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  accept?: string;
  headers?: Record<string, string>;
}

export class CookidooClient {
  readonly domain: string;
  readonly language: string;
  readonly baseUrl: string;
  private readonly cookie: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { cookie: string; locale: string; fetch?: typeof fetch }) {
    this.cookie = options.cookie;
    const loc = getLocalization(options.locale);
    this.domain = loc.domain;
    this.language = loc.language;
    this.baseUrl = `https://${loc.domain}`;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T = unknown>(opts: CookidooRequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers: Record<string, string> = {
      Cookie: this.cookie,
      Accept: opts.accept ?? FULL_VIEW_ACCEPT,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...opts.headers,
    };

    const init: RequestInit = {
      method: opts.method ?? "GET",
      headers,
    };

    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }

    const res = await this.fetchImpl(url, init);
    return parseResponse<T>(res, opts);
  }

  private buildUrl(path: string, query?: CookidooRequestOptions["query"]): string {
    const base = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const url = new URL(base);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async requestImageSignature(options: {
    timestamp: number;
    source: string;
    customCoordinates: string;
  }): Promise<{ signature: string }> {
    return this.request<{ signature: string }>({
      method: "POST",
      path: `/created-recipes/${this.language}/image/signature`,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      body: {
        timestamp: options.timestamp,
        source: options.source,
        custom_coordinates: options.customCoordinates,
      },
    });
  }

  async uploadImageToCloudinary(options: {
    fileBytes: Uint8Array;
    mimeType: string;
    timestamp: number;
    signature: string;
    source: string;
    customCoordinates: string;
  }): Promise<{ public_id: string; format: string }> {
    const formData = new FormData();
    const blob = new Blob([options.fileBytes as any], { type: options.mimeType });
    formData.append("file", blob, "image.jpg");
    formData.append("api_key", "993585863591145");
    formData.append("timestamp", String(options.timestamp));
    formData.append("signature", options.signature);
    formData.append("source", options.source);
    formData.append("custom_coordinates", options.customCoordinates);
    // upload_preset is excluded from the signature (invalid-signature-params) but must
    // still be sent so Cloudinary applies the correct signed preset configuration.
    formData.append("upload_preset", "prod-customer-recipe-signed");

    const res = await this.fetchImpl("https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload", {
      method: "POST",
      body: formData,
    });

    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;

    if (!res.ok) {
      throw new CookidooError({
        message: `Cloudinary upload failed [${res.status}]: ${text}`,
        status: res.status,
        body: parsed ?? text,
        url: "https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload",
        method: "POST",
      });
    }

    return parsed as { public_id: string; format: string };
  }
}


async function parseResponse<T>(res: Response, opts: CookidooRequestOptions): Promise<T> {
  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;

  if (!res.ok) {
    if (res.status === 429) {
      throw new CookidooRateLimitError({
        status: res.status,
        body: parsed ?? text,
        url: opts.path,
        method: opts.method ?? "GET",
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      });
    }
    throw new CookidooError({
      message: `${opts.method ?? "GET"} ${opts.path} failed [${res.status}]`,
      status: res.status,
      body: parsed ?? text,
      url: opts.path,
      method: opts.method ?? "GET",
    });
  }

  if (isRateLimitBody(parsed)) {
    throw new CookidooRateLimitError({
      status: res.status,
      body: parsed,
      url: opts.path,
      method: opts.method ?? "GET",
      retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
    });
  }

  return parsed as T;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const asInt = parseInt(header, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

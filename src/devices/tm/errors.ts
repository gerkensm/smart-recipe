export class CookidooError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;
  readonly method: string;

  constructor(params: {
    message: string;
    status: number;
    body: unknown;
    url: string;
    method: string;
  }) {
    super(params.message);
    this.name = "CookidooError";
    this.status = params.status;
    this.body = params.body;
    this.url = params.url;
    this.method = params.method;
  }
}

export class CookidooAuthError extends CookidooError {
  constructor(params: {
    status: number;
    body: unknown;
    url: string;
    method: string;
  }) {
    super({ ...params, message: `Authentication failed [${params.status}]` });
    this.name = "CookidooAuthError";
  }
}

export class CookidooRateLimitError extends CookidooError {
  readonly retryAfterMs: number | null;

  constructor(params: {
    status: number;
    body: unknown;
    url: string;
    method: string;
    retryAfterMs: number | null;
  }) {
    super({
      ...params,
      message: `Rate limited [${params.status}] on ${params.method} ${params.url}`,
    });
    this.name = "CookidooRateLimitError";
    this.retryAfterMs = params.retryAfterMs;
  }
}

export function isRateLimitBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as { code?: unknown; statusCode?: unknown };
  return b.code === "importFailed" || b.statusCode === 429;
}

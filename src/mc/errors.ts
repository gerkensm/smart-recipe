export interface MonsieurCuisineApiErrorOptions {
  status?: number;
  code?: number;
  endpoint?: string;
  response?: unknown;
}

export class MonsieurCuisineApiError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly endpoint?: string;
  readonly response?: unknown;

  constructor(message: string, options: MonsieurCuisineApiErrorOptions = {}) {
    super(message);
    this.name = "MonsieurCuisineApiError";
    this.status = options.status;
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.response = options.response;
  }
}

export class AuthFlowNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFlowNotImplementedError";
  }
}

export interface AuthFlowErrorOptions {
  code: string;
  response?: unknown;
}

export class AuthFlowError extends Error {
  readonly code: string;
  readonly response?: unknown;

  constructor(message: string, options: AuthFlowErrorOptions) {
    super(message);
    this.name = "AuthFlowError";
    this.code = options.code;
    this.response = options.response;
  }
}

import type { RetrievedRecipePage } from "../retriever/types.js";
import { createLogger, type SmartRecipeLogger } from "../logging/logger.js";
import type { DeviceAdapter } from "./adapter.js";
import { MonsieurCuisineAdapter } from "./mc/adapter.js";
import { ThermomixAdapter } from "./tm/adapter.js";

export type DeviceId = "mc" | "tm";

export interface DeviceApiOptions {
  device: DeviceId;
  cookie?: string;
  locale?: string;
  adapter?: DeviceAdapter;
  logger?: SmartRecipeLogger;
}

export interface ListRecipesOptions {
  cookie?: string;
  page?: number;
  size?: number;
}

export interface GetRecipeOptions {
  cookie?: string;
  id: string;
  public?: boolean;
}

export interface UploadRecipeOptions<TInput = any, TPayload = any> {
  cookie?: string;
  locale?: string;
  page: RetrievedRecipePage;
  recipeInput: TInput;
  payload?: TPayload;
  imageProvider?: any;
  authProvider?: any;
  logger?: SmartRecipeLogger;
}

export class DeviceApi<TInput = any, TPayload = any> {
  readonly id: DeviceId;
  readonly adapter: DeviceAdapter<TInput, TPayload>;
  readonly locale: string;
  private readonly cookie?: string;
  private readonly logger: SmartRecipeLogger;

  constructor(options: DeviceApiOptions) {
    this.id = options.device;
    this.adapter = (options.adapter ?? adapterForDevice(options.device)) as DeviceAdapter<TInput, TPayload>;
    this.cookie = options.cookie;
    this.locale = options.locale ?? "de-DE";
    this.logger = options.logger ?? createLogger();
  }

  getProfile(options: { cookie?: string } = {}) {
    return this.adapter.getCurrentUser(this.requireCookie(options.cookie));
  }

  listRecipes(options: ListRecipesOptions = {}) {
    return this.adapter.listDrafts({
      cookie: this.requireCookie(options.cookie),
      page: options.page,
      size: options.size,
    });
  }

  getRecipe(options: GetRecipeOptions) {
    return this.adapter.getRecipe({
      cookie: this.requireCookie(options.cookie),
      id: options.id,
      public: options.public,
    });
  }

  validateInput(input: unknown) {
    return this.adapter.validateInput(input);
  }

  normalizeInput(input: TInput): TInput {
    return this.adapter.normalizeInput(input);
  }

  formatInputForTerminal(input: TInput) {
    return this.adapter.formatInputForTerminal(input);
  }

  createPayload(input: TInput): TPayload {
    return this.adapter.createPayload(input);
  }

  uploadRecipe(options: UploadRecipeOptions<TInput, TPayload>) {
    const payload = options.payload ?? this.createPayload(options.recipeInput);
    return this.adapter.upload({
      payload,
      recipeInput: options.recipeInput,
      page: options.page,
      locale: options.locale ?? this.locale,
      cookie: this.requireCookie(options.cookie),
      logger: options.logger ?? this.logger,
      imageProvider: options.imageProvider,
      authProvider: options.authProvider,
    });
  }

  browserLogin(options: Parameters<DeviceAdapter["browserLogin"]>[0]) {
    return this.adapter.browserLogin(options);
  }

  private requireCookie(cookie?: string): string {
    const activeCookie = cookie ?? this.cookie;
    if (!activeCookie) {
      throw new Error(`No ${this.adapter.deviceName} cookie configured.`);
    }
    return activeCookie;
  }
}

export function createDeviceApi<TInput = any, TPayload = any>(
  options: DeviceApiOptions
): DeviceApi<TInput, TPayload> {
  return new DeviceApi<TInput, TPayload>(options);
}

function adapterForDevice(device: DeviceId): DeviceAdapter {
  return device === "tm" ? new ThermomixAdapter() : new MonsieurCuisineAdapter();
}

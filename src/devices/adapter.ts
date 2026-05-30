import type { TSchema } from "typebox";
import type { RetrievedRecipePage } from "../retriever/types.js";
import type { AuthProvider } from "../mc/auth.js";
import type { RecipeImageAsset, RecipeImageProvider } from "../pipeline/images.js";

export type DevicePromptOptions = Record<string, unknown>;
export interface RecipeUploadLogger {
  info(object: unknown, message?: string): void;
  warn(object: unknown, message?: string): void;
  error(object: unknown, message?: string): void;
}

export interface DeviceAdapter<TInput = unknown, TPayload = unknown> {
  readonly id: "mc" | "tm";
  readonly deviceName: "MonsieurCuisine" | "Thermomix";

  getSchema(options?: DevicePromptOptions): TSchema;
  getPromptInstructions(locale: string, options?: DevicePromptOptions): string;
  validateInput(input: unknown): { ok: boolean; errors: string[]; formattedErrors?: string };
  normalizeInput(input: TInput): TInput;
  formatInputForTerminal(input: TInput): string;

  browserLogin(options: {
    locale?: string;
    userDataDir?: string;
    timeoutMs?: number;
    headless?: boolean;
    keepOpen?: boolean;
    installBrowsers?: boolean;
    browserChannel?: string;
    browserPath?: string;
    browserSandbox?: boolean;
    credentials?: { email: string; password?: string };
    onStatus?: (message: string) => void;
  }): Promise<{ cookie: string; source: string; cookieNames: string[] }>;

  getCurrentUser(cookie: string): Promise<unknown>;
  listDrafts(options: { cookie: string; page?: number; size?: number }): Promise<unknown>;
  getRecipe(options: { cookie: string; id: string; public?: boolean }): Promise<unknown>;

  createPayload(input: TInput): TPayload;

  upload(options: {
    payload: TPayload;
    recipeInput: TInput;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: RecipeUploadLogger;
    imageProvider?: RecipeImageProvider<TInput>;
    authProvider?: AuthProvider;
  }): Promise<{
    recipeUrl?: string;
    draft: unknown;
    uploadedImage?: unknown;
    recipeImage?: Omit<RecipeImageAsset, "bytes"> & { bytes: number };
    payload: TPayload;
  }>;
}

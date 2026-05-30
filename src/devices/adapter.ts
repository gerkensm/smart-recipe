import type { RetrievedRecipePage } from "../retriever/types.js";

export interface DeviceAdapter<TInput = any, TPayload = any> {
  readonly id: "mc" | "tm";
  readonly deviceName: "MonsieurCuisine" | "Thermomix";

  getSchema(options?: any): any;
  getPromptInstructions(locale: string, options?: any): string;
  validateInput(input: unknown): { ok: boolean; errors: string[] };
  normalizeInput(input: any): any;
  formatInputForTerminal(input: any): string;

  browserLogin(options: {
    locale?: string;
    userDataDir?: string;
    timeoutMs?: number;
    headless?: boolean;
    keepOpen?: boolean;
    installBrowsers?: boolean;
    credentials?: { email: string; password?: string };
    onStatus?: (message: string) => void;
  }): Promise<{ cookie: string; source: string; cookieNames: string[] }>;

  getCurrentUser(cookie: string): Promise<any>;
  listDrafts(options: { cookie: string; page?: number; size?: number }): Promise<any>;
  getRecipe(options: { cookie: string; id: string; public?: boolean }): Promise<any>;

  createPayload(input: TInput): TPayload;

  upload(options: {
    payload: TPayload;
    recipeInput: TInput;
    page: RetrievedRecipePage;
    locale: string;
    cookie: string;
    logger: any;
    imageProvider?: any;
    authProvider?: any;
  }): Promise<{
    recipeUrl?: string;
    draft: any;
    uploadedImage?: any;
    recipeImage?: any;
    payload: TPayload;
  }>;
}

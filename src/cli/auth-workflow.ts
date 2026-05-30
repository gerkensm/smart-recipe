import process from "node:process";
import { upsertDotEnvValue } from "../config/env.js";
import { CookieAuthProvider } from "../mc/auth.js";
import { confirm, input, password as passwordPrompt, select } from "./prompts.js";
import {
  blankLine,
  colorBold,
  colorCyan,
  colorDim,
  printError,
  printHeading,
  printStatus,
  printSuccess,
  printWarning,
} from "./terminal.js";

export async function resolveAuthInteractively(
  options: { cookie?: string },
  isInteractive: boolean,
  adapter: any,
  configPath: string
): Promise<any> {
  const cookieKey = adapter.id === "tm" ? "TM_COOKIE" : "MC_COOKIE";
  const currentCookie = options.cookie ?? process.env[cookieKey];

  if (currentCookie) {
    return createAuthProvider(adapter, currentCookie);
  }

  if (!isInteractive) {
    return makeSilentBrowserAuthProvider(adapter, configPath);
  }

  const passwordProvider = await tryPasswordLogin(adapter, configPath, { promptForMissing: true });
  if (passwordProvider) {
    return passwordProvider;
  }

  const silentProvider = await trySilentSessionRefresh(adapter, configPath);
  if (silentProvider) {
    return silentProvider;
  }

  blankLine();
  printWarning(`No ${adapter.deviceName} session found.`);
  blankLine();

  const method = await select({
    message: "  How would you like to authenticate?",
    choices: [
      {
        name: adapter.id === "tm"
          ? "Browser login  (opens Cookidoo login window)"
          : `Browser login  (opens ${adapter.deviceName} login window)`,
        value: "browser" as const,
        description: adapter.id === "tm"
          ? "A small Chromium window opens so you can\nsign in with your Cookidoo account."
          : "A small Chromium window opens so you can\nsign in with your Lidl Plus account."
      },
      {
        name: "Paste cookie   (enter Cookie header manually)",
        value: "cookie" as const,
        description: adapter.id === "tm"
          ? "Open cookidoo.de (or your local Cookidoo) in your browser,\ncopy the Cookie header from DevTools, and\npaste it here."
          : "Open monsieur-cuisine.com in your browser,\ncopy the Cookie header from DevTools, and\npaste it here."
      }
    ]
  });

  if (method === "browser") {
    try {
      return await attemptBrowserLogin(isInteractive, adapter, configPath);
    } catch {
      blankLine();
      printError("Browser login failed. Falling back to manual cookie.");
      return await promptForManualCookie(adapter, configPath);
    }
  }

  return await promptForManualCookie(adapter, configPath);
}

async function tryPasswordLogin(
  adapter: any,
  configPath: string,
  options: { promptForMissing: boolean }
): Promise<any | null> {
  if (adapter.id !== "tm" || typeof adapter.passwordLogin !== "function") return null;

  let email = process.env.TM_LOGIN;
  let password = process.env.TM_PW;
  if ((!email || !password) && options.promptForMissing) {
    blankLine();
    printHeading("Sign in to Cookidoo without opening a browser");
    if (!email) {
      email = await input({
        message: "  Cookidoo email",
        validate: (value) => (value.trim() ? true : "Email cannot be empty."),
      });
    }
    if (!password) {
      password = await passwordPrompt({
        message: "  Cookidoo password",
        mask: "*",
        validate: (value) => (value ? true : "Password cannot be empty."),
      });
    }
  }
  if (!email || !password) return null;

  const locale = (process.env.TM_LOCALE ?? "de-DE") as any;
  try {
    printStatus("Signing in to Cookidoo without browser...");
    const result = await adapter.passwordLogin({
      locale,
      credentials: { email, password },
    });
    await maybeSaveSessionCookie("TM_COOKIE", result.cookie, configPath, options.promptForMissing);
    printStatus("Signed in to Cookidoo via OAuth redirect flow.");
    return createAuthProvider(adapter, result.cookie);
  } catch {
    if (options.promptForMissing) {
      blankLine();
      printError("Browserless Cookidoo sign-in failed. Falling back to other login methods.");
    }
    return null;
  }
}

async function trySilentSessionRefresh(adapter: any, configPath: string): Promise<any | null> {
  if (adapter.id !== "tm") return null;

  const locale = (process.env.TM_LOCALE ?? "de-DE") as any;
  try {
    printStatus("Checking saved Cookidoo browser session silently...");
    const result = await adapter.browserLogin({
      locale,
      headless: true,
      timeoutMs: 8000,
      installBrowsers: false,
      browserChannel: process.env.SMART_RECIPE_BROWSER_CHANNEL,
      browserPath: process.env.SMART_RECIPE_BROWSER_PATH,
      browserSandbox: browserSandboxFromEnv(),
      onStatus: () => undefined,
    });
    if (process.env.SAVE_SETTINGS !== "false") {
      upsertDotEnvValue(configPath, "TM_COOKIE", result.cookie);
    }
    printStatus("Refreshed Cookidoo session from saved browser profile.");
    return createAuthProvider(adapter, result.cookie);
  } catch {
    return null;
  }
}

export async function attemptBrowserLogin(
  isInteractive: boolean,
  adapter: any,
  configPath: string
): Promise<any> {
  const isTm = adapter.id === "tm";
  const localeKey = isTm ? "TM_LOCALE" : "MC_LOCALE";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";
  const loginKey = isTm ? "TM_LOGIN" : "MC_LOGIN";
  const pwKey = isTm ? "TM_PW" : "MC_PW";

  const locale = (process.env[localeKey] ?? "de-DE") as any;
  blankLine();
  const result = await adapter.browserLogin({
    locale,
    browserChannel: process.env.SMART_RECIPE_BROWSER_CHANNEL,
    browserPath: process.env.SMART_RECIPE_BROWSER_PATH,
    browserSandbox: browserSandboxFromEnv(),
    credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
    onStatus: printStatus
  });

  if (isInteractive) {
    blankLine();
    const saveCookie = process.env.SAVE_SETTINGS !== "false" && await confirm({
      message: `  Save this session cookie to ~/.smart-recipe?`,
      default: true
    });
    if (saveCookie) {
      upsertDotEnvValue(configPath, cookieKey, result.cookie);
      printSuccess(`Saved ${cookieKey} to ${configPath}`);
      blankLine();
    }
  }

  return createAuthProvider(adapter, result.cookie);
}

export async function promptForManualCookie(adapter: any, configPath: string): Promise<any> {
  const isTm = adapter.id === "tm";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";

  blankLine();
  printHeading("How to get your Cookie header:");
  if (isTm) {
    console.log(`  1. Open ${colorCyan("https://cookidoo.de")} (or your local Cookidoo site) and log in.`);
    console.log(`  2. Open DevTools  ${colorDim("(F12 or Cmd+Option+I)")} → Network tab.`);
    console.log("  3. Reload the page, click any request to cookidoo.*.");
    console.log(`  4. In the Request Headers, find ${colorBold("Cookie:")} and copy the full value.`);
  } else {
    console.log(`  1. Open ${colorCyan("https://www.monsieur-cuisine.com")} and log in with your Lidl Plus account.`);
    console.log(`  2. Open DevTools  ${colorDim("(F12 or Cmd+Option+I)")} → Network tab.`);
    console.log("  3. Reload the page, click any request to monsieur-cuisine.com.");
    console.log(`  4. In the Request Headers, find ${colorBold("Cookie:")} and copy the full value.`);
  }
  blankLine();

  const cookie = await input({
    message: "  Paste your Cookie header",
    validate: (v) => (v.trim() ? true : "Cookie cannot be empty.")
  });

  const saveCookie = process.env.SAVE_SETTINGS !== "false" && await confirm({
    message: "  Save this cookie to ~/.smart-recipe?",
    default: true
  });
  if (saveCookie) {
    upsertDotEnvValue(configPath, cookieKey, cookie.trim());
    printSuccess(`Saved ${cookieKey} to ${configPath}`);
    blankLine();
  }

  return createAuthProvider(adapter, cookie.trim());
}

function makeSilentBrowserAuthProvider(adapter: any, configPath: string): any {
  const isTm = adapter.id === "tm";
  const localeKey = isTm ? "TM_LOCALE" : "MC_LOCALE";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";
  const loginKey = isTm ? "TM_LOGIN" : "MC_LOGIN";
  const pwKey = isTm ? "TM_PW" : "MC_PW";

  return {
    async getSession() {
      const locale = (process.env[localeKey] ?? "de-DE") as any;
      if (isTm && typeof adapter.passwordLogin === "function" && process.env.TM_LOGIN && process.env.TM_PW) {
        printStatus(`No ${adapter.deviceName} cookie found. Signing in without browser...`);
        const result = await adapter.passwordLogin({
          locale,
          credentials: { email: process.env.TM_LOGIN, password: process.env.TM_PW },
        });
        upsertDotEnvValue(configPath, cookieKey, result.cookie);
        printStatus(`Saved ${cookieKey} to ${configPath}.`);
        return { cookie: result.cookie, source: result.source };
      }

      printStatus(`No ${adapter.deviceName} cookie found. Opening login window...`);
      const result = await adapter.browserLogin({
        locale,
        browserChannel: process.env.SMART_RECIPE_BROWSER_CHANNEL,
        browserPath: process.env.SMART_RECIPE_BROWSER_PATH,
        browserSandbox: browserSandboxFromEnv(),
        credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
        onStatus: printStatus
      });
      upsertDotEnvValue(configPath, cookieKey, result.cookie);
      printStatus(`Saved ${cookieKey} to ${configPath}.`);
      return { cookie: result.cookie, source: result.source };
    }
  };
}

function browserSandboxFromEnv(): boolean | undefined {
  const raw = process.env.SMART_RECIPE_BROWSER_SANDBOX;
  if (raw === undefined) return undefined;
  return /^(1|true|yes|on)$/i.test(raw);
}

async function maybeSaveSessionCookie(
  cookieKey: "TM_COOKIE" | "MC_COOKIE",
  cookie: string,
  configPath: string,
  isInteractive: boolean
): Promise<void> {
  if (process.env.SAVE_SETTINGS === "false") return;

  if (isInteractive) {
    const saveCookie = await confirm({
      message: `  Save this session cookie to ~/.smart-recipe?`,
      default: true,
    });
    if (!saveCookie) {
      process.env.SAVE_SETTINGS = "false";
      return;
    }
  }

  upsertDotEnvValue(configPath, cookieKey, cookie);
  if (isInteractive) {
    printSuccess(`Saved ${cookieKey} to ${configPath}`);
    blankLine();
  }
}

function createAuthProvider(adapter: any, cookie: string): any {
  if (adapter.id === "tm") {
    return {
      async getSession() {
        return { cookie };
      }
    };
  }

  return new CookieAuthProvider(cookie);
}

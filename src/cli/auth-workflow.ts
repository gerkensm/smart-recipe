import process from "node:process";
import { upsertDotEnvValue } from "../config/env.js";
import { CookieAuthProvider } from "../mc/auth.js";
import { confirm, input, select } from "./prompts.js";

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

  console.log();
  console.log(`  \x1b[1m\x1b[33m⚠  No ${adapter.deviceName} session found.\x1b[0m`);
  console.log();

  const method = await select({
    message: "  How would you like to authenticate?",
    choices: [
      {
        name: `Browser login  (opens ${adapter.deviceName} login window)`,
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
      console.log();
      console.log(`  \x1b[31m✗ Browser login failed.\x1b[0m Falling back to manual cookie.`);
      return await promptForManualCookie(adapter, configPath);
    }
  }

  return await promptForManualCookie(adapter, configPath);
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
  console.log();
  const result = await adapter.browserLogin({
    locale,
    credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
    onStatus: (message: string) => console.error(`  \x1b[2m${message}\x1b[0m`)
  });

  if (isInteractive) {
    console.log();
    const saveCookie = process.env.SAVE_SETTINGS !== "false" && await confirm({
      message: `  Save this session cookie to ~/.smart-recipe?`,
      default: true
    });
    if (saveCookie) {
      upsertDotEnvValue(configPath, cookieKey, result.cookie);
      console.log(`  \x1b[32m✓ Saved ${cookieKey} to ${configPath}\x1b[0m\n`);
    }
  }

  return createAuthProvider(adapter, result.cookie);
}

export async function promptForManualCookie(adapter: any, configPath: string): Promise<any> {
  const isTm = adapter.id === "tm";
  const cookieKey = isTm ? "TM_COOKIE" : "MC_COOKIE";

  console.log();
  console.log("  \x1b[1mHow to get your Cookie header:\x1b[0m");
  if (isTm) {
    console.log("  1. Open \x1b[36mhttps://cookidoo.de\x1b[0m (or your local Cookidoo site) and log in.");
    console.log("  2. Open DevTools  \x1b[2m(F12 or Cmd+Option+I)\x1b[0m → Network tab.");
    console.log("  3. Reload the page, click any request to cookidoo.*.");
    console.log("  4. In the Request Headers, find \x1b[1mCookie:\x1b[0m and copy the full value.");
  } else {
    console.log("  1. Open \x1b[36mhttps://www.monsieur-cuisine.com\x1b[0m and log in with your Lidl Plus account.");
    console.log("  2. Open DevTools  \x1b[2m(F12 or Cmd+Option+I)\x1b[0m → Network tab.");
    console.log("  3. Reload the page, click any request to monsieur-cuisine.com.");
    console.log("  4. In the Request Headers, find \x1b[1mCookie:\x1b[0m and copy the full value.");
  }
  console.log();

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
    console.log(`  \x1b[32m✓ Saved ${cookieKey} to ${configPath}\x1b[0m\n`);
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
      console.error(`No ${adapter.deviceName} cookie found. Opening login window...`);
      const result = await adapter.browserLogin({
        locale,
        credentials: process.env[loginKey] ? { email: process.env[loginKey], password: process.env[pwKey] } : undefined,
        onStatus: (message: string) => console.error(message)
      });
      upsertDotEnvValue(configPath, cookieKey, result.cookie);
      console.error(`Saved ${cookieKey} to ${configPath}.`);
      return { cookie: result.cookie, source: result.source };
    }
  };
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

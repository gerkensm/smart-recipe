import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, type BrowserContext } from "playwright";
import { CookidooError } from "./errors.js";

export interface BrowserLoginOptions {
  locale?: string;
  userDataDir?: string;
  timeoutMs?: number;
  windowSize?: {
    width: number;
    height: number;
  };
  headless?: boolean;
  keepOpen?: boolean;
  installBrowsers?: boolean;
  pollIntervalMs?: number;
  credentials?: {
    email: string;
    password?: string;
  };
  onStatus?: (message: string) => void;
}

export interface BrowserLoginResult {
  cookie: string;
  source: "cookidoo-browser";
  cookieNames: string[];
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function getLocaleDomainMapping(locale: string) {
  const norm = locale.trim().toLowerCase();
  if (norm.startsWith("de")) {
    return { domain: "cookidoo.de", langPath: "de-DE" };
  }
  if (norm.startsWith("fr")) {
    return { domain: "cookidoo.fr", langPath: "fr-FR" };
  }
  if (norm.startsWith("it")) {
    return { domain: "cookidoo.it", langPath: "it-IT" };
  }
  if (norm.startsWith("pl")) {
    return { domain: "cookidoo.pl", langPath: "pl" };
  }
  if (norm.startsWith("cs") || norm.startsWith("cz")) {
    return { domain: "cookidoo.cz", langPath: "cs" };
  }
  if (norm === "en-us" || norm.startsWith("en_us")) {
    return { domain: "cookidoo.thermomix.com", langPath: "en-US" };
  }
  return { domain: "cookidoo.international", langPath: "en" };
}

export async function browserLoginForCookidoo(options: BrowserLoginOptions = {}): Promise<BrowserLoginResult> {
  const locale = options.locale ?? "de-DE";
  const { domain, langPath } = getLocaleDomainMapping(locale);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const windowSize = options.windowSize ?? { width: 560, height: 780 };
  const userDataDir = options.userDataDir ?? path.join(os.tmpdir(), "smart-recipe-cookidoo-browser-login");

  const startUrl = `https://${domain}/profile/${langPath}/login?redirectAfterLogin=%2Ffoundation%2F${langPath}%2Ffor-you`;

  options.onStatus?.(`Opening the Cookidoo login window at: ${startUrl}`);

  let context: BrowserContext | undefined;
  try {
    context = await launchChromiumApp({
      userDataDir,
      startUrl,
      windowSize,
      headless: options.headless ?? false,
      installBrowsers: options.installBrowsers ?? true,
      onStatus: options.onStatus,
    });

    const page = context.pages()[0] ?? (await context.newPage());
    if (page.url() === "about:blank") {
      await page.goto(startUrl);
    }

    if (options.credentials) {
      options.onStatus?.("Auto-filling Cookidoo credentials...");
      await autoFillCookidooLoginForm(page, options.credentials).catch((err) => {
        options.onStatus?.(`Auto-fill failed, please complete login manually: ${err.message}`);
      });
    } else {
      options.onStatus?.("Finish login in the opened Cookidoo window.");
    }

    const result = await waitForCookidooCookies(context, domain, timeoutMs, pollIntervalMs);

    options.onStatus?.("Captured Cookidoo session cookies.");
    if (!options.keepOpen) {
      await context.close();
    }
    return result;
  } catch (error) {
    if (context && !options.keepOpen) {
      await context.close().catch(() => undefined);
    }
    if (isMissingBrowserExecutable(error)) {
      throw new CookidooError({
        message: "Playwright could not find a browser executable. Run `npx playwright install chromium` in the SmartRecipe folder, then try login again.",
        status: 0,
        body: String(error),
        url: startUrl,
        method: "GET",
      });
    }
    throw new CookidooError({
      message: `Browser login failed before Cookidoo session cookies could be captured: ${(error as any).message}`,
      status: 0,
      body: String(error),
      url: startUrl,
      method: "GET",
    });
  }
}

async function launchChromiumApp(options: {
  userDataDir: string;
  startUrl: string;
  windowSize: { width: number; height: number };
  headless: boolean;
  installBrowsers: boolean;
  onStatus?: (message: string) => void;
}): Promise<BrowserContext> {
  try {
    return await launchChromiumAppOnce(options);
  } catch (error) {
    if (!options.installBrowsers || !isMissingBrowserExecutable(error)) {
      throw error;
    }
    options.onStatus?.("Playwright Chromium is not installed. Downloading it now.");
    await installPlaywrightChromium();
    return launchChromiumAppOnce(options);
  }
}

function launchChromiumAppOnce(options: {
  userDataDir: string;
  startUrl: string;
  windowSize: { width: number; height: number };
  headless: boolean;
}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(options.userDataDir, {
    headless: options.headless,
    viewport: null,
    args: [
      `--app=${options.startUrl}`,
      `--window-size=${options.windowSize.width},${options.windowSize.height}`,
    ],
  });
}

async function installPlaywrightChromium(): Promise<void> {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("playwright/package.json");
  const cliPath = path.join(path.dirname(packageJsonPath), "cli.js");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "install", "chromium"], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`playwright install chromium exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

function isMissingBrowserExecutable(error: unknown): boolean {
  if (!error) return false;
  const message = (error as any).message || "";
  return message.includes("Executable doesn't exist") || message.includes("looks like Playwright was just installed");
}

async function autoFillCookidooLoginForm(
  page: import("playwright").Page,
  credentials: { email: string; password?: string }
): Promise<void> {
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => null);

  if (await emailInput.isVisible()) {
    await emailInput.fill(credentials.email);
    if (credentials.password) {
      const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(credentials.password);
        await passwordInput.press("Enter");
      } else {
        await emailInput.press("Enter");
        await passwordInput.waitFor({ state: "visible", timeout: 5000 });
        await passwordInput.fill(credentials.password);
        await passwordInput.press("Enter");
      }
    } else {
      await emailInput.press("Enter");
    }
  }
}

async function waitForCookidooCookies(
  context: BrowserContext,
  domain: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<BrowserLoginResult> {
  const deadline = Date.now() + timeoutMs;
  let lastCookieNames: string[] = [];

  while (Date.now() < deadline) {
    const cookies = await context.cookies([`https://${domain}`]);
    lastCookieNames = cookies.map((c) => c.name).sort();

    const oauth2Proxy = cookies.find((c) => c.name === "_oauth2_proxy");
    const vAuthenticated = cookies.find((c) => c.name === "v-authenticated");

    if (oauth2Proxy && vAuthenticated) {
      const cookieStr = `_oauth2_proxy=${oauth2Proxy.value}; v-authenticated=${vAuthenticated.value}; v-is-authenticated=true`;
      return {
        cookie: cookieStr,
        source: "cookidoo-browser",
        cookieNames: lastCookieNames,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new CookidooError({
    message: "Browser login timed out before Cookidoo session cookies appeared. Please finish logging in.",
    status: 0,
    body: { seenCookieNames: lastCookieNames },
    url: `https://${domain}`,
    method: "GET",
  });
}

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
  browserChannel?: string;
  browserPath?: string;
  browserSandbox?: boolean;
  pollIntervalMs?: number;
  credentials?: {
    email: string;
    password?: string;
  };
  onStatus?: (message: string) => void;
}

export interface BrowserLoginResult {
  cookie: string;
  source: "cookidoo-browser" | "cookidoo-password";
  cookieNames: string[];
}

export interface PasswordLoginOptions {
  locale?: string;
  credentials: {
    email: string;
    password: string;
  };
  fetch?: typeof fetch;
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

  const headless = options.headless ?? false;
  options.onStatus?.(
    headless
      ? "Checking saved Cookidoo browser session silently..."
      : `Opening the Cookidoo login window at: ${startUrl}`
  );

  let context: BrowserContext | undefined;
  try {
    const browserChannel = options.browserChannel ?? process.env.SMART_RECIPE_BROWSER_CHANNEL;
    const browserPath = options.browserPath ?? process.env.SMART_RECIPE_BROWSER_PATH;
    context = await launchChromiumApp({
      userDataDir,
      startUrl,
      windowSize,
      headless,
      installBrowsers: options.installBrowsers ?? !(browserChannel || browserPath),
      browserChannel,
      browserPath,
      browserSandbox: options.browserSandbox ?? parseBrowserSandboxEnv() ?? Boolean(browserChannel || browserPath),
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
    } else if (!headless) {
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

export async function passwordLoginForCookidoo(options: PasswordLoginOptions): Promise<BrowserLoginResult> {
  const locale = options.locale ?? "de-DE";
  const { domain, langPath } = getLocaleDomainMapping(locale);
  const fetchImpl = options.fetch ?? fetch;
  const jar = new SimpleCookieJar();
  const startUrl = `https://${domain}/profile/${langPath}/login?redirectAfterLogin=%2Ffoundation%2F${langPath}%2Ffor-you`;

  const loginPage = await fetchWithRedirects(fetchImpl, jar, startUrl);
  const existingCookie = jar.cookidooAuthHeader(domain);
  if (existingCookie) {
    return {
      cookie: existingCookie,
      source: "cookidoo-password",
      cookieNames: jar.cookieNames(),
    };
  }

  const requestId = extractCookidooRequestId(loginPage.body);

  const form = new URLSearchParams({
    requestId,
    username: options.credentials.email,
    password: options.credentials.password,
  });

  await fetchWithRedirects(fetchImpl, jar, "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: loginPage.url,
    },
    body: form,
  });

  const cookie = jar.cookidooAuthHeader(domain);
  if (!cookie) {
    throw new CookidooError({
      message: "Cookidoo password login did not return authenticated session cookies.",
      status: 401,
      body: { cookieNames: jar.cookieNames() },
      url: startUrl,
      method: "POST",
    });
  }

  return {
    cookie,
    source: "cookidoo-password",
    cookieNames: jar.cookieNames(),
  };
}

async function launchChromiumApp(options: {
  userDataDir: string;
  startUrl: string;
  windowSize: { width: number; height: number };
  headless: boolean;
  installBrowsers: boolean;
  browserChannel?: string;
  browserPath?: string;
  browserSandbox: boolean;
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
  browserChannel?: string;
  browserPath?: string;
  browserSandbox: boolean;
}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(options.userDataDir, {
    headless: options.headless,
    channel: options.browserChannel,
    executablePath: options.browserPath,
    chromiumSandbox: options.browserSandbox,
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

async function fetchWithRedirects(
  fetchImpl: typeof fetch,
  jar: SimpleCookieJar,
  url: string,
  init: RequestInit = {},
  maxRedirects = 12
): Promise<{ url: string; status: number; body: string }> {
  let currentUrl = url;
  let currentInit = init;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const headers = new Headers(currentInit.headers);
    const cookie = jar.headerForUrl(currentUrl);
    if (cookie) headers.set("Cookie", cookie);
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    const res = await fetchImpl(currentUrl, {
      ...currentInit,
      headers,
      redirect: "manual",
    });
    jar.storeFromResponse(currentUrl, res.headers);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new CookidooError({
          message: `Cookidoo login redirect missing Location header [${res.status}]`,
          status: res.status,
          body: undefined,
          url: currentUrl,
          method: currentInit.method ?? "GET",
        });
      }
      currentUrl = new URL(location, currentUrl).toString();
      currentInit = { method: "GET" };
      continue;
    }

    return {
      url: currentUrl,
      status: res.status,
      body: await res.text(),
    };
  }

  throw new CookidooError({
    message: "Cookidoo login exceeded maximum redirects.",
    status: 0,
    body: undefined,
    url,
    method: init.method ?? "GET",
  });
}

function extractCookidooRequestId(html: string): string {
  const match =
    html.match(/name=["']requestId["'][^>]*value=["']([^"']+)["']/i) ??
    html.match(/value=["']([^"']+)["'][^>]*name=["']requestId["']/i);
  const requestId = match?.[1]?.trim();
  if (!requestId) {
    throw new CookidooError({
      message: "Could not extract Cookidoo login requestId from CIAM login page.",
      status: 0,
      body: html.slice(0, 500),
      url: "https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login",
      method: "GET",
    });
  }
  return requestId;
}

class SimpleCookieJar {
  private readonly cookies = new Map<string, { name: string; value: string; domain: string; path: string }>();

  storeFromResponse(url: string, headers: Headers): void {
    const origin = new URL(url);
    for (const header of getSetCookieHeaders(headers)) {
      const parsed = parseSetCookie(header, origin.hostname);
      if (!parsed) continue;
      const key = `${parsed.domain}|${parsed.path}|${parsed.name}`;
      if (!parsed.value) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, parsed);
      }
    }
  }

  headerForUrl(url: string): string {
    const target = new URL(url);
    const values = [...this.cookies.values()]
      .filter((cookie) => domainMatches(target.hostname, cookie.domain) && target.pathname.startsWith(cookie.path))
      .map((cookie) => `${cookie.name}=${cookie.value}`);
    return values.join("; ");
  }

  cookidooAuthHeader(domain: string): string | undefined {
    const values = [...this.cookies.values()].filter((cookie) => domainMatches(domain, cookie.domain));
    const oauth2Proxy = values.find((cookie) => cookie.name === "_oauth2_proxy");
    const vAuthenticated = values.find((cookie) => cookie.name === "v-authenticated");
    const vIsAuthenticated = values.find((cookie) => cookie.name === "v-is-authenticated");
    if (!oauth2Proxy || !vAuthenticated) return undefined;
    return [
      `_oauth2_proxy=${oauth2Proxy.value}`,
      `v-authenticated=${vAuthenticated.value}`,
      `v-is-authenticated=${vIsAuthenticated?.value ?? "true"}`,
    ].join("; ");
  }

  cookieNames(): string[] {
    return [...this.cookies.values()].map((cookie) => cookie.name).sort();
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as any).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers).flatMap((header: string) => splitCombinedSetCookie(header));
  }
  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

function parseBrowserSandboxEnv(): boolean | undefined {
  const raw = process.env.SMART_RECIPE_BROWSER_SANDBOX;
  if (raw === undefined) return undefined;
  return /^(1|true|yes|on)$/i.test(raw);
}

function splitCombinedSetCookie(header: string): string[] {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((part) => part.trim()).filter(Boolean);
}

function parseSetCookie(header: string, fallbackDomain: string): { name: string; value: string; domain: string; path: string } | null {
  const parts = header.split(";").map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  const eq = nameValue.indexOf("=");
  if (eq <= 0) return null;
  const name = nameValue.slice(0, eq);
  const value = nameValue.slice(eq + 1);
  let domain = fallbackDomain;
  let path = "/";
  for (const attr of attributes) {
    const [rawKey, ...rawVal] = attr.split("=");
    const key = rawKey.trim().toLowerCase();
    const val = rawVal.join("=").trim();
    if (key === "domain" && val) domain = val.replace(/^\./, "");
    if (key === "path" && val) path = val;
  }
  return { name, value, domain, path };
}

function domainMatches(host: string, cookieDomain: string): boolean {
  const normalizedHost = host.toLowerCase();
  const normalizedCookieDomain = cookieDomain.replace(/^\./, "").toLowerCase();
  return normalizedHost === normalizedCookieDomain || normalizedHost.endsWith(`.${normalizedCookieDomain}`);
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

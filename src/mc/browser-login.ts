import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, type BrowserContext, type Cookie } from "playwright";
import type { SupportedLocale } from "../catalogs/types.js";
import { AuthFlowError } from "./errors.js";

export interface BrowserLoginOptions {
  locale?: SupportedLocale;
  monsieurCuisineBaseUrl?: string;
  startUrl?: string;
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
  source: "lidl-browser";
  cookieNames: string[];
}

const DEFAULT_MC_BASE_URL = "https://www.monsieur-cuisine.com";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;

export async function browserLoginForMonsieurCuisine(options: BrowserLoginOptions = {}): Promise<BrowserLoginResult> {
  const locale = options.locale ?? "de-DE";
  const monsieurCuisineBaseUrl = trimTrailingSlash(options.monsieurCuisineBaseUrl ?? DEFAULT_MC_BASE_URL);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const windowSize = options.windowSize ?? { width: 560, height: 780 };
  const userDataDir = options.userDataDir ?? path.join(os.tmpdir(), "smart-recipe-browser-login");

  // When the caller supplies a custom startUrl, skip MC SSO pre-fetch and use
  // the URL directly (for testing or alternative flows).
  let startUrl = options.startUrl;
  let mcSessionCookies: Cookie[] | undefined;

  if (!startUrl) {
    // Pre-fetch the MC SSO login endpoint to obtain:
    //   1. The PHPSESSID cookie (MC stores the OAuth state in this session)
    //   2. The Lidl authorize URL (Location header) with the MC-generated state
    //
    // This lets us open the browser directly at the Lidl login page so the
    // user never has to interact with the MC website, while still ensuring
    // MC's state validation succeeds on the redirect back.
    options.onStatus?.("Requesting login session from Monsieur Cuisine…");
    const ssoResult = await fetchMonsieurCuisineSsoRedirect({
      locale,
      monsieurCuisineBaseUrl
    });
    startUrl = ssoResult.lidlLoginUrl;
    mcSessionCookies = ssoResult.cookies;
    options.onStatus?.(`Obtained login session (state=${ssoResult.state}).`);
  }

  // If we have an email credential, tell IdentityServer to skip the Welcome
  // screen and pre-fill the email by passing the standard OIDC login_hint.
  if (options.credentials?.email && startUrl) {
    try {
      const urlObj = new URL(startUrl);
      
      // If we rewrote to the direct /Account/Login URL, we need to add it to the ReturnUrl
      // instead, as IdentityServer reads it from the inner return URL parameters.
      if (urlObj.pathname === "/Account/Login") {
        const returnUrlParam = urlObj.searchParams.get("ReturnUrl");
        if (returnUrlParam) {
          // It's a relative URL like /connect/authorize/callback?...
          // So we can just append it:
          const separator = returnUrlParam.includes("?") ? "&" : "?";
          urlObj.searchParams.set("ReturnUrl", `${returnUrlParam}${separator}login_hint=${encodeURIComponent(options.credentials.email)}`);
          startUrl = urlObj.toString();
        }
      } else {
        urlObj.searchParams.set("login_hint", options.credentials.email);
        startUrl = urlObj.toString();
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  options.onStatus?.("Opening the Lidl Plus login window.");

  let context: BrowserContext | undefined;
  try {
    context = await launchChromiumApp({
      userDataDir,
      startUrl,
      windowSize,
      headless: options.headless ?? false,
      installBrowsers: options.installBrowsers ?? true,
      onStatus: options.onStatus
    });

    // Inject the MC PHPSESSID cookie so that the redirect back from Lidl can
    // be validated by MC's PHP backend against the session that holds the state.
    if (mcSessionCookies?.length) {
      await context.addCookies(mcSessionCookies);
    }

    const page = context.pages()[0] ?? await context.newPage();
    if (page.url() === "about:blank") await page.goto(startUrl);

    if (options.credentials) {
      options.onStatus?.("Auto-filling Lidl Plus login form...");
      await autoFillLidlLoginForm(page, options.credentials).catch((err) => {
        options.onStatus?.(`Auto-fill failed, please complete login manually: ${err.message}`);
      });
    } else {
      options.onStatus?.("Finish login in the opened Lidl Plus window.");
    }

    const result = await waitForMonsieurCuisineCookies(context, {
      monsieurCuisineBaseUrl,
      languagePath: languageCookieFromLocale(locale),
      timeoutMs,
      pollIntervalMs
    });

    options.onStatus?.("Captured Monsieur Cuisine session cookies.");
    if (!options.keepOpen) await context.close();
    return result;
  } catch (error) {
    if (context && !options.keepOpen) await context.close().catch(() => undefined);
    if (isMissingBrowserExecutable(error)) {
      throw new AuthFlowError(
        "Playwright could not find a browser executable. Run `npx playwright install chromium` in the SmartRecipe folder, then try `login-browser` again, or leave automatic browser installation enabled.",
        { code: "browser_executable_missing", response: errorMessage(error) }
      );
    }
    if (error instanceof AuthFlowError) throw error;
    throw new AuthFlowError("Browser login failed before a Monsieur Cuisine session cookie could be captured.", {
      code: "browser_login_failed",
      response: errorMessage(error)
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
    if (!options.installBrowsers || !isMissingBrowserExecutable(error)) throw error;
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
      `--window-size=${options.windowSize.width},${options.windowSize.height}`
    ]
  });
}

async function installPlaywrightChromium(): Promise<void> {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("playwright/package.json");
  const cliPath = path.join(path.dirname(packageJsonPath), "cli.js");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "install", "chromium"], {
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright install chromium exited with code ${code ?? "unknown"}`));
    });
  });
}

async function autoFillLidlLoginForm(page: import("playwright").Page, credentials: { email: string; password?: string }): Promise<void> {
  // 1. Handle possible cookie banners or welcome screens
  const emailInput = page.locator('input[type="email"]').first();
  
  // Wait for either the email input or a button to render, avoiding artificial timeouts
  await page.locator('input[type="email"], button, a[role="button"], .btn')
    .first()
    .waitFor({ state: "visible", timeout: 10000 })
    .catch(() => null);

  if (!await emailInput.isVisible()) {
    // If not, we might be on a Welcome screen with a Login button (like "Anmelden")
    // We'll click the first visible button that looks like a primary action,
    // avoiding "register" or "create account" links.
    const buttons = page.locator('button, a[role="button"], .btn');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = await btn.textContent() || "";
        // Skip obvious registration buttons
        if (!/regist|erstellen|create|sign up|neu/i.test(text)) {
          await btn.click().catch(() => null);
          break;
        }
      }
    }
  }

  // Now wait for the email input to appear
  await emailInput.waitFor({ state: "visible", timeout: 10000 });

  // 2. Fill email
  await emailInput.fill(credentials.email);

  if (credentials.password) {
    // 3. Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    
    // Sometimes password field is hidden until email is "submitted"
    if (!await passwordInput.isVisible()) {
      await emailInput.press('Enter');
    }

    await passwordInput.waitFor({ state: "visible", timeout: 10000 });
    await passwordInput.fill(credentials.password);
      
    // 4. Submit form
    // Pressing Enter on the password field is the most robust way to submit a standard web form
    await passwordInput.press('Enter');
  } else {
    // If no password provided, just submit the email to advance to the next step
    await emailInput.press('Enter');
  }
}

async function waitForMonsieurCuisineCookies(
  context: BrowserContext,
  options: {
    monsieurCuisineBaseUrl: string;
    languagePath: string;
    timeoutMs: number;
    pollIntervalMs: number;
  }
): Promise<BrowserLoginResult> {
  const deadline = Date.now() + options.timeoutMs;
  let lastCookieNames: string[] = [];

  while (Date.now() < deadline) {
    const cookies = await context.cookies([options.monsieurCuisineBaseUrl, `${options.monsieurCuisineBaseUrl}/${options.languagePath}/`]);
    lastCookieNames = cookies.map((cookie) => cookie.name).sort();
    const cookie = monsieurCuisineCookieHeader(cookies, options.monsieurCuisineBaseUrl, options.languagePath);

    if (hasRequiredSessionCookies(cookie)) {
      return {
        cookie,
        source: "lidl-browser",
        cookieNames: lastCookieNames
      };
    }

    await delay(options.pollIntervalMs);
  }

  throw new AuthFlowError(
    "Browser login timed out before Monsieur Cuisine session cookies appeared. Complete the login in the popup, make sure you are logged into www.monsieur-cuisine.com, then try again.",
    {
      code: "browser_login_timeout",
      response: {
        missing: ["wordpress_logged_in_*", "lidl_sso_id_token"],
        seenCookieNames: lastCookieNames
      }
    }
  );
}

function monsieurCuisineCookieHeader(cookies: Cookie[], monsieurCuisineBaseUrl: string, languagePath: string): string {
  const host = new URL(monsieurCuisineBaseUrl).hostname;
  const values = cookies
    .filter((cookie) => domainMatches(cookie.domain, host))
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  if (!values.some((value) => value.startsWith("wp-wpml_current_language="))) {
    values.unshift(`wp-wpml_current_language=${languagePath}`);
  }

  return values.join("; ");
}

export function createLidlWebLoginUrl(options: {
  locale: string;
  monsieurCuisineBaseUrl: string;
}): string {
  const authorizationParams = new URLSearchParams({
    language: languageFromLocale(options.locale),
    country: countryCodeFromLocale(options.locale),
    response_type: "code",
    redirect_uri: `${options.monsieurCuisineBaseUrl}/sso/post/login/redirect/`,
    client_id: "monsieurcuisinewebcompanionclient",
    nonce: randomToken(),
    state: randomToken(),
    scope: "openid profile openid",
    transaction_id: randomUuid()
  });

  const loginParams = new URLSearchParams({
    ReturnUrl: `/connect/authorize/callback?${authorizationParams.toString()}`
  });
  return `https://accounts.lidl.com/Account/Login?${loginParams.toString()}`;
}

interface SsoRedirectResult {
  /** The full Lidl authorize URL (Location header from MC's 302). */
  lidlLoginUrl: string;
  /** The state token MC generated and stored in the PHP session. */
  state: string;
  /** Cookies to inject into the browser (PHPSESSID + GCLB). */
  cookies: Cookie[];
}

/**
 * Hit MC's server-side SSO initiation endpoint:
 *   GET {base}/{lang}/sso/login?redirect_uri=...
 *
 * MC responds with:
 *   302 Location: https://accounts.lidl.com/connect/authorize?...&state=<mc_state>
 *   Set-Cookie: PHPSESSID=<session_id>
 *
 * We extract the Location (Lidl login URL with MC-generated state) and the
 * session cookies so we can inject them into the browser before navigating.
 */
async function fetchMonsieurCuisineSsoRedirect(options: {
  locale: string;
  monsieurCuisineBaseUrl: string;
}): Promise<SsoRedirectResult> {
  const languagePath = languageCookieFromLocale(options.locale);
  const redirectUri = `${options.monsieurCuisineBaseUrl}/${languagePath}/create-recipe`;
  const ssoLoginUrl = `${options.monsieurCuisineBaseUrl}/${languagePath}/sso/login?redirect_uri=${encodeURIComponent(redirectUri)}`;

  const response = await fetch(ssoLoginUrl, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const location = response.headers.get("location");
  if (!location) {
    throw new AuthFlowError(
      `Monsieur Cuisine SSO login did not return a redirect (HTTP ${response.status}). The login initiation endpoint may have changed.`,
      { code: "sso_no_redirect", response: { status: response.status, url: ssoLoginUrl } }
    );
  }

  // Extract the state from the redirect URL for logging/diagnostics.
  const parsedLocation = new URL(location);
  const state = parsedLocation.searchParams.get("state") ?? "unknown";

  // Rewrite the authorize URL into a direct login URL to skip the Welcome screen
  let lidlLoginUrl = location;
  if (parsedLocation.pathname === "/connect/authorize") {
    const returnUrl = `/connect/authorize/callback?${parsedLocation.searchParams.toString()}`;
    const directUrl = new URL("/Account/Login", parsedLocation.origin);
    directUrl.searchParams.set("ReturnUrl", returnUrl);
    lidlLoginUrl = directUrl.toString();
  }

  // Parse Set-Cookie headers into Playwright Cookie objects.
  const mcHost = new URL(options.monsieurCuisineBaseUrl).hostname;
  const cookies = parseSetCookieHeaders(response.headers, mcHost);

  return { lidlLoginUrl, state, cookies };
}

/**
 * Parse Set-Cookie headers from an HTTP response into Playwright-compatible
 * Cookie objects that can be injected with `context.addCookies()`.
 */
function parseSetCookieHeaders(headers: Headers, defaultDomain: string): Cookie[] {
  const setCookies = getSetCookieHeaders(headers);
  const result: Cookie[] = [];

  for (const header of setCookies) {
    const [nameValue] = header.split(";");
    const eqIndex = nameValue.indexOf("=");
    if (eqIndex < 0) continue;

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();
    const domain = (header.match(/;\s*domain=([^;]+)/i)?.[1] ?? defaultDomain).replace(/^\./, "").toLowerCase();
    const path = header.match(/;\s*path=([^;]+)/i)?.[1] ?? "/";
    const secure = /;\s*secure/i.test(header);
    const httpOnly = /;\s*httponly/i.test(header);
    const sameSite = /samesite=none/i.test(header) ? "None" as const
      : /samesite=strict/i.test(header) ? "Strict" as const
      : "Lax" as const;

    result.push({ name, value, domain, path, secure, httpOnly, sameSite, expires: -1 });
  }

  return result;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (getSetCookie) return getSetCookie.call(headers);
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}


function hasRequiredSessionCookies(cookie: string): boolean {
  return cookie.includes("wordpress_logged_in_") && cookie.includes("lidl_sso_id_token=");
}

function domainMatches(cookieDomain: string, host: string): boolean {
  const normalized = cookieDomain.replace(/^\./, "").toLowerCase();
  return host.toLowerCase() === normalized || host.toLowerCase().endsWith(`.${normalized}`);
}

function languageCookieFromLocale(locale: string): string {
  return locale.toLowerCase().split("-")[0] || "de";
}

function languageFromLocale(locale: string): string {
  const [language, country] = locale.split("-");
  return `${language || "de"}-${country || (language || "de").toUpperCase()}`;
}

function countryCodeFromLocale(locale: string): string {
  const [, country] = locale.split("-");
  return country?.toUpperCase() || "DE";
}

function randomToken(): string {
  return randomUuid().replace(/-/g, "");
}

function randomUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackRandomUuid();
}

function fallbackRandomUuid(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ Math.floor(Math.random() * 16) >> Number(char) / 4).toString(16)
  );
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingBrowserExecutable(error: unknown): boolean {
  return /Executable doesn't exist|Looks like Playwright was just installed or updated|Please run the following command to download new browsers/i.test(errorMessage(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { randomUUID } from "node:crypto";
import { AuthFlowError } from "./errors.js";
import type { SupportedLocale } from "../catalogs/types.js";

export interface AuthSession {
  cookie: string;
  source: "cookie" | "lidl-browser" | "lidl-password";
}

export interface AuthProvider {
  getSession(): Promise<AuthSession>;
}

export class CookieAuthProvider implements AuthProvider {
  constructor(private readonly cookie: string) {}

  async getSession(): Promise<AuthSession> {
    if (!this.cookie.trim()) throw new Error("CookieAuthProvider requires a non-empty cookie.");
    return { cookie: this.cookie, source: "cookie" };
  }
}

export class BrowserCookieAuthProvider implements AuthProvider {
  constructor(private readonly promptForCookie: () => Promise<string>) {}

  async getSession(): Promise<AuthSession> {
    const cookie = await this.promptForCookie();
    if (!cookie.trim()) throw new Error("No cookie was provided.");
    return { cookie, source: "lidl-browser" };
  }
}


function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
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

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

import pino, { type Logger, type LoggerOptions } from "pino";
import pretty from "pino-pretty";

export type LogLevel = "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface SmartRecipeLoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  name?: string;
  destination?: number;
}

export type SmartRecipeLogger = Logger;

export function createLogger(options: SmartRecipeLoggerOptions = {}): SmartRecipeLogger {
  const level = options.level ?? "silent";
  const base: LoggerOptions = {
    name: options.name ?? "smart-recipe",
    level,
    redact: {
      paths: [
        "cookie",
        "headers.cookie",
        "headers.Cookie",
        "password",
        "token",
        "*.cookie",
        "*.password",
        "*.token"
      ],
      censor: "[redacted]"
    }
  };

  if (options.pretty) {
    return pino(
      base,
      pretty({
        colorize: true,
        singleLine: true,
        translateTime: "HH:MM:ss",
        destination: options.destination
      })
    );
  }

  return options.destination === undefined ? pino(base) : pino(base, pino.destination(options.destination));
}

export const silentLogger = createLogger();

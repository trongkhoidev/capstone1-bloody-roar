// apps/web/src/lib/logger.ts
// Pino logger — structured JSON logging

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

/**
 * Create a child logger with a module name prefix
 * Usage: const log = createLogger("auth")
 */
export function createLogger(module: string) {
  return logger.child({ module });
}

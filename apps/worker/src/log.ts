import pino from "pino";

export type Logger = Pick<pino.Logger, "info" | "warn" | "error">;
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

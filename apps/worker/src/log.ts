// One JSON object per line on stdout, so logs stay structured in Railway.
export type Fields = Record<string, unknown>;

export type Logger = {
  info(fields: Fields, msg: string): void;
  warn(fields: Fields, msg: string): void;
  error(fields: Fields, msg: string): void;
};

export function createLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  const emit = (level: string) => (fields: Fields, msg: string) =>
    write(JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  return { info: emit("info"), warn: emit("warn"), error: emit("error") };
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

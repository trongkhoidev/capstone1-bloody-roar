import { createHmac } from "node:crypto";
import { createLogger } from "../lib/logger";

const log = createLogger("ai-hash");
const LOCAL_DEV_KEY = "local-dev-ai-hash-key";
let warnedMissingKey = false;

// Keyed hash for AI audit records: a plain SHA-256 of short texts can be reversed by guessing the text.
export function auditHash(value: string): string {
  const key = process.env.AI_HASH_KEY;
  if (key) return createHmac("sha256", key).update(value).digest("hex");
  if (process.env.NODE_ENV === "production") throw new Error("AI_HASH_KEY is required in production");
  if (!warnedMissingKey) {
    warnedMissingKey = true;
    log.warn("AI_HASH_KEY is not set; using the local development key");
  }
  return createHmac("sha256", LOCAL_DEV_KEY).update(value).digest("hex");
}

import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditHash } from "../ai/hash";

describe("auditHash", () => {
  beforeEach(() => vi.stubEnv("AI_HASH_KEY", "key-one"));
  afterEach(() => vi.unstubAllEnvs());

  it("gives the same hash for the same input and key", () => {
    expect(auditHash("message")).toBe(auditHash("message"));
  });

  it("gives a different hash under a different key", () => {
    const first = auditHash("message");
    vi.stubEnv("AI_HASH_KEY", "key-two");
    expect(auditHash("message")).not.toBe(first);
  });

  it("is an HMAC-SHA256 under the configured key, not a plain SHA-256 digest", () => {
    expect(auditHash("message")).toBe(createHmac("sha256", "key-one").update("message").digest("hex"));
    expect(auditHash("message")).not.toBe(createHash("sha256").update("message").digest("hex"));
  });

  it("refuses to run without a key in production", () => {
    vi.stubEnv("AI_HASH_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => auditHash("message")).toThrow("AI_HASH_KEY is required in production");
  });
});

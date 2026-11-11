import { afterEach, describe, expect, it, vi } from "vitest";
import { keyBytes } from "../lib/github/crypto";

describe("keyBytes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads a 64-character hex key as 32 bytes", () => {
    vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", "ab".repeat(32));
    expect(keyBytes()).toEqual(Buffer.alloc(32, 0xab));
  });

  it("reads a 43-character base64url key as the same 32 bytes", () => {
    vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 0xab).toString("base64url"));
    expect(keyBytes()).toEqual(Buffer.alloc(32, 0xab));
  });

  it("returns null for any other shape", () => {
    vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", "not-a-key");
    expect(keyBytes()).toBeNull();
  });
});

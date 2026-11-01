import { describe, expect, it } from "vitest";
import { validateSiwePayload } from "../lib/auth/siwe-validation";
import { authDomain, authUri } from "../lib/auth/siwe";

describe("SIWE server identity", () => {
  it("derives a canonical origin and host from the configured app URL", () => {
    expect(authUri("https://example.com/app/ignored?x=1")).toBe("https://example.com");
    expect(authDomain("https://example.com/app/ignored?x=1")).toBe("example.com");
  });
});

describe("validateSiwePayload", () => {
  const validPayload = {
    type: "evm" as const,
    domain: "localhost:4000",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    statement: "Sign in",
    version: "1",
    uri: "http://localhost:4000",
    chain_id: "84532",
    nonce: "12345678",
    issued_at: "2026-09-15T01:00:00.000Z",
    expiration_time: "2026-09-15T01:10:00.000Z",
    invalid_before: "2026-09-15T00:59:00.000Z",
  };

  it("rejects a payload for a different chain", () => {
    expect(() => validateSiwePayload(
      { payload: { ...validPayload, chain_id: "1" }, signature: "0x1234" },
      { domain: "localhost:4000", uri: "http://localhost:4000", chainId: "84532", now: new Date("2026-09-15T01:05:00.000Z") },
    )).toThrow("chain");
  });

  it("rejects malformed and future timestamps", () => {
    expect(() => validateSiwePayload(
      { payload: { ...validPayload, issued_at: "not-a-date" }, signature: "0x1234" },
      { domain: "localhost:4000", uri: "http://localhost:4000", chainId: "84532", now: new Date("2026-09-15T01:05:00.000Z") },
    )).toThrow("Issued At");

    expect(() => validateSiwePayload(
      { payload: { ...validPayload, issued_at: "2026-09-15T01:06:00.000Z" }, signature: "0x1234" },
      { domain: "localhost:4000", uri: "http://localhost:4000", chainId: "84532", now: new Date("2026-09-15T01:05:00.000Z") },
    )).toThrow("future");
  });
});

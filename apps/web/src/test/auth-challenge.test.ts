import { describe, expect, it } from "vitest";
import { buildChallengeIdentity, consumeSiweChallenge } from "../lib/auth/challenge";

describe("SIWE challenge", () => {
  it("binds a challenge to nonce, wallet, domain, URI and chain", () => {
    expect(buildChallengeIdentity({
      nonce: "nonce-123",
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      domain: "localhost:4000",
      uri: "http://localhost:4000",
      chainId: "84532",
    })).toEqual({
      nonceHash: "1d9664478addbe4ee7186c19b2a2c98e461a77dc1e183654f36916bf9fb51cba",
      walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      domain: "localhost:4000",
      uri: "http://localhost:4000",
      chainId: 84532,
    });
  });

  it("rejects a challenge that was already consumed or expired", async () => {
    const repository = { updateMany: async () => ({ count: 0 }) };
    await expect(consumeSiweChallenge(repository, {
      nonceHash: "hash",
      walletAddress: "0xabc",
      domain: "localhost:4000",
      uri: "http://localhost:4000",
      chainId: 84532,
    }, new Date("2026-09-15T01:05:00.000Z"))).rejects.toThrow("challenge");
  });
});

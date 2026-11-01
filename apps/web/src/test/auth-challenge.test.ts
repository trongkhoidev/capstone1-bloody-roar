import { describe, expect, it } from "vitest";
import { buildChallengeIdentity, ChallengeReplayError, consumeSiweChallenge } from "../lib/auth/challenge";

const identity = {
  nonceHash: "hash",
  walletAddress: "0xabc",
  domain: "localhost:4000",
  uri: "http://localhost:4000",
  chainId: 84532,
};

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
    const repository = { updateMany: async () => ({ count: 0 }), findUnique: async () => null };
    await expect(consumeSiweChallenge(repository, identity, new Date("2026-09-15T01:05:00.000Z"))).rejects.toThrow("challenge");
  });

  it("reports a replay when the same nonce is presented again", async () => {
    const repository = {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({ consumedAt: new Date("2026-09-15T01:00:00.000Z") }),
    };
    await expect(consumeSiweChallenge(repository, identity, new Date("2026-09-15T01:05:00.000Z"))).rejects.toBeInstanceOf(ChallengeReplayError);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { getEscrowChainSettings, isEscrowConcurrencyError } from "../lib/escrow/integration";

const originalEnv = {
  RPC_URL: process.env.RPC_URL,
  ESCROW_ADDRESS: process.env.ESCROW_ADDRESS,
  CHAIN_ID: process.env.CHAIN_ID,
  ESCROW_MIN_CONFIRMATIONS: process.env.ESCROW_MIN_CONFIRMATIONS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("escrow chain configuration", () => {
  it("reads the shared chain environment variables", () => {
    process.env.RPC_URL = "http://127.0.0.1:8545";
    process.env.ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.CHAIN_ID = "31337";
    delete process.env.ESCROW_MIN_CONFIRMATIONS;
    expect(getEscrowChainSettings()).toEqual({
      rpcUrl: "http://127.0.0.1:8545",
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: 31337,
      minConfirmations: 3,
    });
  });

  it.each(["RPC_URL", "ESCROW_ADDRESS"])("reports missing %s", (key) => {
    process.env.RPC_URL = "http://127.0.0.1:8545";
    process.env.ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
    delete process.env[key];
    expect(() => getEscrowChainSettings()).toThrow(key);
  });

  it("rejects an unsafe confirmation setting", () => {
    process.env.RPC_URL = "https://example.invalid/rpc";
    process.env.ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.ESCROW_MIN_CONFIRMATIONS = "0";

    expect(() => getEscrowChainSettings()).toThrow("RPC_URL");
  });

  it("classifies unique and serialization conflicts as retryable escrow races", () => {
    const unique = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const serialization = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "test" });

    expect(isEscrowConcurrencyError(unique)).toBe(true);
    expect(isEscrowConcurrencyError(serialization)).toBe(true);
    expect(isEscrowConcurrencyError(new Error("rpc failed"))).toBe(false);
  });
});

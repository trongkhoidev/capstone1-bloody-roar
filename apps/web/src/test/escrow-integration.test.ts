import { afterEach, describe, expect, it } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { getEscrowChainSettings, isEscrowConcurrencyError } from "../lib/escrow/integration";

const originalEnv = {
  ESCROW_RPC_URL: process.env.ESCROW_RPC_URL,
  ESCROW_CONTRACT_ADDRESS: process.env.ESCROW_CONTRACT_ADDRESS,
  ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA: process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA,
  BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL,
  ESCROW_CHAIN_ID: process.env.ESCROW_CHAIN_ID,
  ESCROW_MIN_CONFIRMATIONS: process.env.ESCROW_MIN_CONFIRMATIONS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("escrow chain configuration", () => {
  it("uses the repository's documented Base Sepolia environment variables", () => {
    delete process.env.ESCROW_RPC_URL;
    delete process.env.ESCROW_CONTRACT_ADDRESS;
    delete process.env.ESCROW_CHAIN_ID;
    delete process.env.ESCROW_MIN_CONFIRMATIONS;
    process.env.BASE_SEPOLIA_RPC_URL = "https://base-sepolia.example.invalid/rpc";
    process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA = "0x1111111111111111111111111111111111111111";

    expect(getEscrowChainSettings()).toEqual({
      rpcUrl: "https://base-sepolia.example.invalid/rpc",
      contractAddress: "0x1111111111111111111111111111111111111111",
      chainId: 84532,
      minConfirmations: 3,
    });
  });

  it("rejects an unsafe confirmation setting", () => {
    process.env.ESCROW_RPC_URL = "https://example.invalid/rpc";
    process.env.ESCROW_CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.ESCROW_MIN_CONFIRMATIONS = "0";

    expect(() => getEscrowChainSettings()).toThrow("not configured");
  });

  it("classifies unique and serialization conflicts as retryable escrow races", () => {
    const unique = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const serialization = new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "test" });

    expect(isEscrowConcurrencyError(unique)).toBe(true);
    expect(isEscrowConcurrencyError(serialization)).toBe(true);
    expect(isEscrowConcurrencyError(new Error("rpc failed"))).toBe(false);
  });
});

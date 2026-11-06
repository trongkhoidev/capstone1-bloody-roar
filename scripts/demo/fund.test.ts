// @ts-ignore
import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { ethers, type providers } from "./lib/ethers";
import { appendLedger, readLedger, type LedgerEntry } from "./lib/ledger";
import {
  assertBaseSepolia,
  assertNotForbidden,
  BASE_SEPOLIA_CHAIN_ID,
  FORBIDDEN_PUBLIC_DEPLOYER,
  fundLocalWallets,
  getTargetEthForRole,
} from "./fund";

describe("Fund and Gas Distribution Logic (R2)", () => {
  it("rejects forbidden public deployer address", () => {
    expect(() => assertNotForbidden(FORBIDDEN_PUBLIC_DEPLOYER)).toThrow("CRITICAL: Cannot use forbidden public deployer key");
    expect(() => assertNotForbidden("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf")).toThrow();
    expect(() => assertNotForbidden("0x1111111111111111111111111111111111111111")).not.toThrow();
  });

  it("enforces Base Sepolia chainId 84532", async () => {
    const mockWrongChainProvider = {
      getNetwork: async () => ({ chainId: 31337, name: "hardhat" }),
    };

    await expect(assertBaseSepolia(mockWrongChainProvider)).rejects.toThrow("Chain mismatch: expected 84532, got 31337");

    const mockRightChainProvider = {
      getNetwork: async () => ({ chainId: 84532, name: "base-sepolia" }),
    };

    await expect(assertBaseSepolia(mockRightChainProvider)).resolves.toBeUndefined();
  });

  it("calculates correct target ETH amounts per persona", () => {
    expect(getTargetEthForRole("deployer")).toEqual(ethers.utils.parseEther("0.003"));
    expect(getTargetEthForRole("ownerSafe")).toEqual(ethers.utils.parseEther("0.0003"));
    expect(getTargetEthForRole("developer")).toEqual(ethers.utils.parseEther("0.0005"));
    expect(getTargetEthForRole("client")).toEqual(ethers.utils.parseEther("0.0005"));
  });

  it("records and reads ledger entries accurately", () => {
    const tmpLedger = path.resolve(process.cwd(), "demo-wallets-test-tmp/test-ledger.jsonl");
    const entry: LedgerEntry = {
      ts: new Date().toISOString(),
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      asset: "ETH",
      amount: "0.0005",
      txHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
      purpose: "test funding",
    };

    try {
      appendLedger(entry, tmpLedger);
      const read = readLedger(tmpLedger);
      expect(read.length).toBe(1);
      expect(read[0]?.from).toBe(entry.from);
      expect(read[0]?.amount).toBe(entry.amount);
    } finally {
      if (fs.existsSync(tmpLedger)) {
        fs.rmSync(path.dirname(tmpLedger), { recursive: true, force: true });
      }
    }
  });

  it("funds local wallets via hardhat_setBalance and mints mUSDC for clients", async () => {
    const sentCalls: Array<{ method: string; params: unknown[] }> = [];
    const mintCalls: Array<{ to?: string }> = [];

    const mockProvider = {
      resolveName: async (n: string) => n,
      getNetwork: async () => ({ chainId: 31337 }),
      send: async (method: string, params: unknown[]) => {
        sentCalls.push({ method, params });
        return true;
      },
      getSigner: () => ({
        _isSigner: true,
        provider: mockProvider,
        getAddress: async () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        estimateGas: async () => ethers.BigNumber.from(21000),
        sendTransaction: async (tx: { to?: string }) => {
          mintCalls.push(tx);
          return { wait: async () => ({ status: 1, logs: [] }) };
        },
      }),
    } as unknown as providers.JsonRpcProvider;

    const tmpKeys = path.resolve(process.cwd(), "demo-wallets-test-tmp/keys.json");
    fs.mkdirSync(path.dirname(tmpKeys), { recursive: true });
    fs.writeFileSync(
      tmpKeys,
      JSON.stringify({
        user01: { role: "user01", address: "0x1111111111111111111111111111111111111111", privateKey: "0x01", persona: "client" },
        dev01: { role: "dev01", address: "0x2222222222222222222222222222222222222222", privateKey: "0x02", persona: "developer" },
      })
    );

    try {
      const res = await fundLocalWallets(mockProvider, tmpKeys);
      expect(res.fundedCount).toBe(2);
      expect(res.mintedUsdcCount).toBe(1);
      expect(sentCalls.filter((c) => c.method === "hardhat_setBalance").length).toBe(2);
      expect(mintCalls.length).toBe(1);
    } finally {
      if (fs.existsSync(tmpKeys)) {
        fs.rmSync(path.dirname(tmpKeys), { recursive: true, force: true });
      }
    }
  });
});

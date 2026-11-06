// @ts-ignore
import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadOrCreateWallets, ROLE_DEFINITIONS } from "./wallets";

describe("Demo Wallets Store (R1)", () => {
  const tmpDir = path.resolve(process.cwd(), "demo-wallets-test-tmp");
  const tmpKeys = path.join(tmpDir, "keys.json");
  const tmpDoc = path.join(tmpDir, "WALLETS.md");

  it("creates wallets idempotently and enforces 0600 mode without forbidden deployer", () => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      // First run
      const store1 = loadOrCreateWallets(tmpKeys, tmpDoc);
      expect(Object.keys(store1).length).toBe(ROLE_DEFINITIONS.length);

      // Verify file permissions 0600
      const stat1 = fs.statSync(tmpKeys);
      const mode = stat1.mode & 0o777;
      expect(mode).toBe(0o600);

      // Check no address is the forbidden public deployer key (0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf)
      const forbidden = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf".toLowerCase();
      for (const entry of Object.values(store1)) {
        expect(entry.address.toLowerCase()).not.toBe(forbidden);
        expect(entry.privateKey.startsWith("0x")).toBe(true);
        expect(entry.address.startsWith("0x")).toBe(true);
      }

      // Second run: addresses must remain identical
      const store2 = loadOrCreateWallets(tmpKeys, tmpDoc);
      expect(Object.keys(store2).length).toBe(ROLE_DEFINITIONS.length);
      for (const [role, entry] of Object.entries(store1)) {
        expect(store2[role]?.address).toBe(entry.address);
        expect(store2[role]?.privateKey).toBe(entry.privateKey);
      }

      // Check WALLETS.md content has no private keys
      const docContent = fs.readFileSync(tmpDoc, "utf-8");
      expect(docContent.includes("0x")).toBe(true);
      for (const entry of Object.values(store1)) {
        expect(docContent.includes(entry.address)).toBe(true);
        expect(docContent.includes(entry.privateKey)).toBe(false);
      }
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it("maps admin role to Hardhat #2 arbiter when CHAIN_ID is 31337", () => {
    const origChainId = process.env.CHAIN_ID;
    const tmpDir2 = path.resolve(process.cwd(), "demo-wallets-test-tmp-local");
    const tmpKeys2 = path.join(tmpDir2, "keys.json");
    const tmpDoc2 = path.join(tmpDir2, "WALLETS.md");
    try {
      process.env.CHAIN_ID = "31337";
      const store = loadOrCreateWallets(tmpKeys2, tmpDoc2);
      expect(store["admin"]?.address.toLowerCase()).toBe("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC".toLowerCase());
    } finally {
      if (origChainId !== undefined) {
        process.env.CHAIN_ID = origChainId;
      } else {
        delete process.env.CHAIN_ID;
      }
      if (fs.existsSync(tmpDir2)) {
        fs.rmSync(tmpDir2, { recursive: true, force: true });
      }
    }
  });
});

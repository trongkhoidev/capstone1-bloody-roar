import { expect, test } from "bun:test";
import { loadConfig } from "../src/config";

const valid = {
  RPC_URL: "http://127.0.0.1:8545",
  CHAIN_ID: "84532",
  ESCROW_ADDRESS: "0x" + "AB".repeat(20),
  ESCROW_DEPLOY_BLOCK: "12345",
  DATABASE_URL: "postgresql://localhost/db",
};

test("loads a valid env with defaults and lowercases the escrow address", () => {
  const config = loadConfig(valid);
  expect(config.chainId).toBe(84532);
  expect(config.escrowAddress).toBe("0x" + "ab".repeat(20));
  expect(config.escrowDeployBlock).toBe(12345n);
  expect(config.port).toBe(4300);
  expect(config.rangeSize).toBe(2000);
  expect(config.reorgWindow).toBe(64);
  expect(config.alertWebhookUrl).toBeUndefined();
});

test("prefers DIRECT_URL for the advisory lock", () => {
  expect(loadConfig({ ...valid, DIRECT_URL: "postgresql://direct/db" }).lockUrl).toBe("postgresql://direct/db");
  expect(loadConfig(valid).lockUrl).toBe("postgresql://localhost/db");
});

test("reports every missing or invalid value at once", () => {
  expect(() => loadConfig({ ...valid, RPC_URL: undefined, CHAIN_ID: "0", ESCROW_ADDRESS: "0x12" })).toThrow(
    /RPC_URL is required.*CHAIN_ID must be a positive integer.*ESCROW_ADDRESS must be a 0x address/,
  );
  expect(() => loadConfig({ ...valid, CHAIN_ID: undefined })).toThrow(/CHAIN_ID is required/);
  expect(() => loadConfig({ ...valid, DATABASE_URL: undefined })).toThrow(/DIRECT_URL or DATABASE_URL is required/);
});

// @vitest-environment node
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { assertChainConfig, defaultLocalManifestPath } from "@bloody-roar/shared/chain-guard";

// A fake RPC reader stands in for the node; state lets each case choose what the node reports.
const state = { chainId: 31337, code: "0x6080" as string | undefined };
const reader = { getChainId: async () => state.chainId, getBytecode: async () => state.code } as never;
const check = (opts: Parameters<typeof assertChainConfig>[0]) => assertChainConfig(opts, reader);

const escrow = "0x2222222222222222222222222222222222222222";
const manifestMismatch = resolve(process.cwd(), "src/test/fixtures/escrow-manifest-mismatch.json");
const base = { rpcUrl: "http://127.0.0.1:8545", chainId: 31337, escrowAddress: escrow };

beforeEach(() => {
  state.chainId = 31337;
  state.code = "0x6080";
});

describe("chain configuration guard", () => {
  it("refuses a node serving a different chain than CHAIN_ID", async () => {
    state.chainId = 1;
    await expect(check(base)).rejects.toThrow("CHAIN_ID mismatch: rpc=1 env=31337");
  });

  it("refuses an escrow address with no contract code", async () => {
    state.code = "0x";
    await expect(check(base)).rejects.toThrow("No contract code at ESCROW_ADDRESS");
    state.code = undefined;
    await expect(check(base)).rejects.toThrow("No contract code at ESCROW_ADDRESS");
  });

  it("refuses an escrow that differs from the local deployment manifest", async () => {
    await expect(check({ ...base, manifestPath: manifestMismatch })).rejects.toThrow(
      "ESCROW_ADDRESS does not match the local deployment manifest",
    );
  });

  it("accepts a consistent configuration, and skips the manifest outside the local chain", async () => {
    await expect(check(base)).resolves.toBeUndefined();
    state.chainId = 84532;
    await expect(check({ ...base, chainId: 84532, manifestPath: manifestMismatch })).resolves.toBeUndefined();
  });

  it("finds no local manifest when run from a folder without one", () => {
    expect(defaultLocalManifestPath(resolve("/"))).toBeUndefined();
  });
});

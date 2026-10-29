import { afterEach, expect, it, vi } from "vitest";
import { utils } from "ethers";
import type * as EthersModule from "ethers";
import { toFunctionSelector } from "@bloody-roar/shared/escrow";

const rpc = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("ethers", async (importOriginal) => {
  const original = await importOriginal<typeof EthersModule>();
  return { ...original, providers: { ...original.providers, JsonRpcProvider: class { call = rpc.call; } } };
});
import { readEscrowToken } from "../lib/escrow/token";

afterEach(() => vi.unstubAllEnvs());

it("reads the escrow token with the token() selector", async () => {
  vi.stubEnv("RPC_URL", "http://127.0.0.1:8545");
  const token = "0x2222222222222222222222222222222222222222";
  const contract = "0x1111111111111111111111111111111111111111";
  rpc.call.mockResolvedValue(utils.defaultAbiCoder.encode(["address"], [token]));
  expect(await readEscrowToken(contract, 31337)).toBe(token);
  expect(rpc.call).toHaveBeenCalledWith({ to: contract, data: toFunctionSelector("token()") });
});

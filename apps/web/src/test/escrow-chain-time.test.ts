import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getChainId: vi.fn(), getBlock: vi.fn() }));
vi.mock("@bloody-roar/shared", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@bloody-roar/shared")), createPublicClient: () => mock, http: vi.fn() }));
import { readChainTime } from "../lib/escrow/chain-time";
beforeEach(() => { vi.stubEnv("RPC_URL", "http://127.0.0.1:8545"); mock.getChainId.mockReset().mockResolvedValue(31337); mock.getBlock.mockReset().mockResolvedValue({ number: 20n, timestamp: 1_900_000_000n }); });
describe("chain time", () => {
  it("uses the latest block timestamp", async () => {
    expect((await readChainTime(31337)).toISOString()).toBe(new Date(1_900_000_000_000).toISOString());
    expect(mock.getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
  });
  it("fails closed on wrong chain or missing block", async () => {
    mock.getChainId.mockResolvedValueOnce(1);
    await expect(readChainTime(31337)).rejects.toMatchObject({ extensions: { code: "ESCROW_RPC_UNAVAILABLE" } });
    mock.getBlock.mockResolvedValueOnce({ number: null, timestamp: 1n });
    await expect(readChainTime(31337)).rejects.toMatchObject({ extensions: { code: "ESCROW_RPC_UNAVAILABLE" } });
  });
});

import type { PrismaClient } from "@bloody-roar/database";
import { waitFor } from "./waitFor";

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json() as { result?: T; error?: { message: string } };
  if (body.error || body.result === undefined) throw new Error(`RPC ${method}: ${body.error?.message ?? "missing result"}`);
  return body.result;
}

export const snapshotChain = () => rpc<string>("evm_snapshot");

export async function advanceTime(seconds: number) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

// Reverts the chain, then waits until the worker has reconciled its checkpoint with the reverted chain.
export async function restoreChain(snapshot: string, prisma: PrismaClient) {
  if (!(await rpc<boolean>("evm_revert", [snapshot]))) throw new Error("evm_revert failed");
  const where = { chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!.toLowerCase() };
  const checkpoint = await prisma.projectionCheckpoint.findFirstOrThrow({ where });
  while (BigInt(await rpc<string>("eth_blockNumber")) < checkpoint.lastScannedBlock) await rpc("evm_mine");
  await waitFor(async () => {
    const current = await prisma.projectionCheckpoint.findFirstOrThrow({ where });
    const block = await rpc<{ hash: string } | null>("eth_getBlockByNumber", [`0x${current.lastScannedBlock.toString(16)}`, false]);
    return !!block && block.hash.toLowerCase() === current.lastCanonicalBlockHash.toLowerCase();
  });
}

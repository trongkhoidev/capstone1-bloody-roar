import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { createPublicClient, http, type PublicClient } from "viem";

const LOCAL_CHAIN_ID = 31337;

// The local deployment manifest, found from either the repo root or apps/web and apps/worker.
export function defaultLocalManifestPath(cwd = process.cwd()): string | undefined {
  return ["apps/contracts/deployments/localhost.json", "../contracts/deployments/localhost.json"]
    .map((candidate) => resolve(cwd, candidate))
    .find((candidate) => existsSync(candidate));
}

// Startup check: fails fast when the RPC serves another chain, has no contract at the escrow address,
// or when the local deployment manifest names a different escrow. Imported via @bloody-roar/shared/chain-guard
// because it reads files and must stay out of the browser barrel.
export type ChainReader = Pick<PublicClient, "getChainId" | "getBytecode">;

export async function assertChainConfig(
  opts: { rpcUrl: string; chainId: number; escrowAddress: string; manifestPath?: string | undefined },
  client: ChainReader = createPublicClient({ transport: http(opts.rpcUrl) }),
): Promise<void> {

  const rpcChainId = await client.getChainId();
  if (rpcChainId !== opts.chainId) throw new Error(`CHAIN_ID mismatch: rpc=${rpcChainId} env=${opts.chainId}`);

  const code = await client.getBytecode({ address: opts.escrowAddress as `0x${string}` });
  if (!code || code === "0x") throw new Error("No contract code at ESCROW_ADDRESS");

  if (opts.manifestPath && opts.chainId === LOCAL_CHAIN_ID && existsSync(opts.manifestPath)) {
    const manifest = JSON.parse(await readFile(opts.manifestPath, "utf8")) as { address?: string };
    if ((manifest.address ?? "").toLowerCase() !== opts.escrowAddress.toLowerCase())
      throw new Error("ESCROW_ADDRESS does not match the local deployment manifest");
  }
}

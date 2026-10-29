import { createPublicClient, http } from "@bloody-roar/shared";
import { gqlError } from "../../graphql/errors";

export async function readChainTime(expectedChainId: number): Promise<Date> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl || !/^https?:\/\//.test(rpcUrl)) throw gqlError("RPC_URL is invalid or missing", "ESCROW_NOT_CONFIGURED");
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock({ blockTag: "latest" })]);
    if (chainId !== expectedChainId || block.number === null) throw new Error("Unexpected chain or pending block");
    const time = Number(block.timestamp) * 1000;
    if (!Number.isSafeInteger(time) || Number.isNaN(new Date(time).getTime())) throw new Error("Invalid block timestamp");
    return new Date(time);
  } catch {
    throw gqlError("Không thể đọc thời gian trên chain", "ESCROW_RPC_UNAVAILABLE");
  }
}

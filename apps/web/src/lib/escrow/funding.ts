import { createPublicClient, http } from "@bloody-roar/shared";
import { ESCROW_ABI, type Hex } from "@bloody-roar/shared/escrow";
import { gqlError } from "../../graphql/errors";

const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function readFundingState(input: { chainId: number; contractAddress: Hex; tokenAddress: Hex; clientAddress: Hex }) {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl || !/^https?:\/\//.test(rpcUrl)) throw gqlError("RPC_URL is invalid or missing", "ESCROW_NOT_CONFIGURED");
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock({ blockTag: "latest" })]);
    if (chainId !== input.chainId || block.number === null) throw new Error("Unexpected chain or pending block");
    const [balance, allowance, paused, token] = await Promise.all([
      client.readContract({ address: input.tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [input.clientAddress], blockNumber: block.number }),
      client.readContract({ address: input.tokenAddress, abi: tokenAbi, functionName: "allowance", args: [input.clientAddress, input.contractAddress], blockNumber: block.number }),
      client.readContract({ address: input.contractAddress, abi: ESCROW_ABI, functionName: "paused", blockNumber: block.number }),
      client.readContract({ address: input.contractAddress, abi: ESCROW_ABI, functionName: "token", blockNumber: block.number }),
    ]);
    return { balance, allowance, paused, token, blockTimestamp: block.timestamp };
  } catch {
    throw gqlError("Không thể đọc trạng thái ký quỹ trên chain", "ESCROW_RPC_UNAVAILABLE");
  }
}

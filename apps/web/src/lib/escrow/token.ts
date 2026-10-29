import { providers, utils } from "ethers";
import { toFunctionSelector } from "@bloody-roar/shared/escrow";
import { gqlError } from "../../graphql/errors";

export async function readEscrowToken(contractAddress: string, chainId: number): Promise<string> {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl || !/^https?:\/\//.test(rpcUrl)) throw gqlError("RPC_URL is invalid or missing", "ESCROW_NOT_CONFIGURED");
  try {
    const provider = new providers.JsonRpcProvider(rpcUrl, chainId);
    const result = await provider.call({ to: contractAddress, data: toFunctionSelector("token()") });
    return utils.getAddress(utils.defaultAbiCoder.decode(["address"], result)[0]);
  } catch {
    throw gqlError("Không thể đọc token của escrow", "ESCROW_RPC_UNAVAILABLE");
  }
}

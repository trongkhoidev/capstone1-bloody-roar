import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex, ESCROW_ABI } from "@bloody-roar/shared";
import type { Job } from "../runtime/scheduler";
import type { RpcClient } from "../chain/client";

const abi: Abi = ESCROW_ABI;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function normalizePendingAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const lower = addr.toLowerCase();
  return lower === ZERO_ADDRESS ? null : lower;
}

async function callGetter<T>(rpc: RpcClient, escrowAddress: string, functionName: string): Promise<T> {
  const data = encodeFunctionData({ abi, functionName });
  const result = await rpc.call<Hex>("eth_call", [{ to: escrowAddress, data }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data: result }) as T;
}

export const contractConfigJob: Job = {
  name: "contract-config",
  everyMs: 60_000,
  async run({ db, rpc, config }) {
    const escrowAddress = config.escrowAddress.toLowerCase();

    const [
      paused,
      owner,
      pendingOwner,
      arbiter,
      pendingArbiter,
      feeRecipient,
      pendingFeeRecipient,
    ] = await Promise.all([
      callGetter<boolean>(rpc, config.escrowAddress, "paused"),
      callGetter<string>(rpc, config.escrowAddress, "owner"),
      callGetter<string>(rpc, config.escrowAddress, "pendingOwner"),
      callGetter<string>(rpc, config.escrowAddress, "arbiter"),
      callGetter<string>(rpc, config.escrowAddress, "pendingArbiter"),
      callGetter<string>(rpc, config.escrowAddress, "feeRecipient"),
      callGetter<string>(rpc, config.escrowAddress, "pendingFeeRecipient"),
    ]);

    const data = {
      chainId: config.chainId,
      contractAddress: escrowAddress,
      paused,
      owner: owner.toLowerCase(),
      pendingOwner: normalizePendingAddress(pendingOwner),
      arbiter: arbiter.toLowerCase(),
      pendingArbiter: normalizePendingAddress(pendingArbiter),
      feeRecipient: feeRecipient.toLowerCase(),
      pendingFeeRecipient: normalizePendingAddress(pendingFeeRecipient),
    };

    await db.contractConfig.upsert({
      where: {
        chainId_contractAddress: {
          chainId: config.chainId,
          contractAddress: escrowAddress,
        },
      },
      create: data,
      update: data,
    });
  },
};

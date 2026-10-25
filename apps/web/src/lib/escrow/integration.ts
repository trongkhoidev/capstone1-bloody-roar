import { utils } from "ethers";
import { Prisma } from "@bloody-roar/database";
import { gqlError } from "../../graphql/errors";
import {
  EscrowVerificationError,
  loadAndVerifyEscrowReceipt,
  type ExpectedEscrowEvent,
  type LoadedEscrowReceipt,
} from "./chain";

export type EscrowChainSettings = {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  minConfirmations: number;
};

export function isEscrowConcurrencyError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function getEscrowChainSettings(): EscrowChainSettings {
  const rpcUrl = process.env.ESCROW_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL;
  const contractAddress =
    process.env.ESCROW_CONTRACT_ADDRESS ?? process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA;
  const chainId = Number(process.env.ESCROW_CHAIN_ID ?? "84532");
  const minConfirmations = Number(process.env.ESCROW_MIN_CONFIRMATIONS ?? "3");
  if (
    !rpcUrl ||
    !/^https?:\/\//.test(rpcUrl) ||
    !contractAddress ||
    !utils.isAddress(contractAddress) ||
    !Number.isSafeInteger(chainId) ||
    !Number.isSafeInteger(minConfirmations) ||
    minConfirmations < 1 ||
    minConfirmations > 100
  ) {
    throw gqlError("Escrow chain integration is not configured", "ESCROW_NOT_CONFIGURED");
  }
  return { rpcUrl, contractAddress: utils.getAddress(contractAddress), chainId, minConfirmations };
}

export async function verifyConfiguredEscrowTransaction(
  settings: EscrowChainSettings,
  txHash: string,
  expected: ExpectedEscrowEvent,
): Promise<LoadedEscrowReceipt> {
  try {
    return await loadAndVerifyEscrowReceipt(
      settings.rpcUrl,
      settings.chainId,
      txHash,
      settings.contractAddress,
      expected,
      settings.minConfirmations,
    );
  } catch (error) {
    if (error instanceof EscrowVerificationError) throw gqlError(error.message, error.code);
    throw gqlError("Unable to verify the escrow transaction", "ESCROW_RPC_UNAVAILABLE");
  }
}

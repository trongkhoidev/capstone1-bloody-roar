// apps/web/src/lib/escrow/prepare.ts
// Ghi TransactionIntent AWAITING_SIGNATURE rồi trả calldata để ví ký.
// Hàm không kiểm điều kiện nghiệp vụ: người gọi phải kiểm trước.

import { IntentStatus, type PrismaClient } from "@bloody-roar/database";
import {
  encodeEscrowCall,
  ESCROW_CONSTANTS,
  type EscrowMethod,
  type PreparedCall,
} from "@bloody-roar/shared/escrow";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { gqlError } from "../../graphql/errors";

// shortcut: đọc env như getEscrowChainSettings, chuyển sang lib/config/env.ts khi A1 merge
function escrowTarget() {
  const contractAddress =
    process.env.ESCROW_CONTRACT_ADDRESS ?? process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA;
  const chainId = Number(process.env.ESCROW_CHAIN_ID ?? ACTIVE_CHAIN_ID);
  if (
    !contractAddress ||
    !/^0x[0-9a-fA-F]{40}$/.test(contractAddress) ||
    !Number.isSafeInteger(chainId)
  ) {
    throw gqlError("Escrow chain integration is not configured", "ESCROW_NOT_CONFIGURED");
  }
  return { contractAddress: contractAddress as `0x${string}`, chainId };
}

export async function createPreparedCall(
  db: PrismaClient,
  input: {
    userId: string;
    method: EscrowMethod;
    args: Record<string, string>;
    issueId?: string;
    escrowKey?: string;
    expiresInMinutes?: number;
  },
): Promise<PreparedCall> {
  const { contractAddress, chainId } = escrowTarget();
  const data = encodeEscrowCall(input.method, input.args);
  const expiresAt = new Date(
    Date.now() + (input.expiresInMinutes ?? ESCROW_CONSTANTS.INTENT_MINUTES) * 60_000,
  );

  const intent = await db.transactionIntent.create({
    data: {
      userId: input.userId,
      issueId: input.issueId ?? null,
      escrowKey: input.escrowKey ?? null,
      chainId,
      contractAddress,
      method: input.method,
      args: input.args,
      status: IntentStatus.AWAITING_SIGNATURE,
      expiresAt,
    },
  });

  return {
    intentId: intent.id,
    chainId,
    to: contractAddress,
    method: input.method,
    args: input.args,
    data,
    value: "0",
    expiresAt: expiresAt.toISOString(),
  };
}

import {
  EscrowPhase,
  Prisma,
  TransactionStatus,
  type TransactionType,
} from "@bloody-roar/database";
import type { GraphQLContext } from "../../graphql/context";
import { requireAuth } from "../../graphql/context";
import { gqlError } from "../../graphql/errors";
import { decimalAmountToRaw } from "./amounts";
import {
  verifyEscrowLogContinuity,
  type ExpectedEscrowEvent,
  type LoadedEscrowReceipt,
} from "./chain";
import {
  getEscrowChainSettings,
  isEscrowConcurrencyError,
  verifyConfiguredEscrowTransaction,
  type EscrowChainSettings,
} from "./integration";
import { isNewerEscrowReceipt, projectEscrowReceipt } from "./projection";

export const ESCROW_INCLUDE = {
  token: true,
  client: true,
  developer: true,
  transactions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
} satisfies Prisma.EscrowInclude;
export const ESCROW_ACTIONS = [
  "RELEASE",
  "CANCEL",
  "WORK",
  "PROPOSE_SETTLEMENT",
  "REVOKE_SETTLEMENT",
  "DISPUTE",
  "COUNTERPARTY_EVIDENCE",
  "INITIAL_RULING",
  "CHALLENGE",
  "FINAL_RULING",
  "ACCEPT_SETTLEMENT",
  "MISSED_DELIVERY_REFUND",
  "REVIEW_TIMEOUT",
  "FINALIZE_RULING",
  "ARBITER_TIMEOUT_SPLIT",
] as const;
export type ConfirmEscrowInput = {
  issueId: string;
  txHash: string;
  action: (typeof ESCROW_ACTIONS)[number];
  hash?: string;
  clientBps?: number;
  reason?: string;
  note?: string;
};

export function transactionData(
  txHash: string,
  type: TransactionType,
  receipt: LoadedEscrowReceipt,
  settings: EscrowChainSettings,
) {
  return {
    txHash: txHash.toLowerCase(),
    type,
    status: TransactionStatus.CONFIRMED,
    from: receipt.from,
    to: settings.contractAddress.toLowerCase(),
    logIndex: receipt.logIndex,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    confirmations: receipt.confirmations,
    gasUsed: BigInt(receipt.gasUsed.toString()),
    gasPrice: receipt.gasPrice ? BigInt(receipt.gasPrice.toString()) : null,
    chainId: settings.chainId,
  } satisfies Prisma.TransactionUncheckedCreateWithoutEscrowInput;
}

export async function confirmEscrowAction(ctx: GraphQLContext, input: ConfirmEscrowInput) {
  const user = requireAuth(ctx);
  const escrow = await ctx.db.escrow.findUnique({
    where: { issueId: input.issueId },
    include: { ...ESCROW_INCLUDE, dispute: true },
  });
  if (!escrow) throw gqlError("Escrow not found", "NOT_FOUND");
  const isParty = escrow.clientId === user.id || escrow.developerId === user.id;
  if (!isParty && user.role !== "ADMIN")
    throw gqlError(
      "Only escrow participants or administrators can confirm this escrow",
      "FORBIDDEN",
    );
  if (input.action === "RELEASE" && escrow.clientId !== user.id)
    throw gqlError("Only the escrow client can release funds", "FORBIDDEN");
  if (input.action === "WORK" && escrow.developerId !== user.id)
    throw gqlError("Only the developer can submit work", "FORBIDDEN");
  if (
    [
      "PROPOSE_SETTLEMENT",
      "REVOKE_SETTLEMENT",
      "DISPUTE",
      "COUNTERPARTY_EVIDENCE",
      "CHALLENGE",
    ].includes(input.action) &&
    !isParty
  ) {
    throw gqlError("Only escrow participants can perform this action", "FORBIDDEN");
  }
  if (["INITIAL_RULING", "FINAL_RULING"].includes(input.action) && user.role !== "ADMIN")
    throw gqlError("Admin access required", "FORBIDDEN");
  const types: Record<ConfirmEscrowInput["action"], TransactionType> = {
    RELEASE: "RELEASE",
    CANCEL: "RESOLVE",
    WORK: "WORK",
    PROPOSE_SETTLEMENT: "SETTLEMENT",
    REVOKE_SETTLEMENT: "SETTLEMENT",
    DISPUTE: "DISPUTE",
    COUNTERPARTY_EVIDENCE: "EVIDENCE",
    INITIAL_RULING: "RULING",
    CHALLENGE: "CHALLENGE",
    FINAL_RULING: "RULING",
    ACCEPT_SETTLEMENT: "RESOLVE",
    MISSED_DELIVERY_REFUND: "RESOLVE",
    REVIEW_TIMEOUT: "RESOLVE",
    FINALIZE_RULING: "RESOLVE",
    ARBITER_TIMEOUT_SPLIT: "RESOLVE",
  };
  const settings = getEscrowChainSettings();
  if (
    escrow.contractAddress?.toLowerCase() !== settings.contractAddress.toLowerCase() ||
    escrow.token.chainId !== settings.chainId
  ) {
    throw gqlError("Escrow does not match the configured deployment", "ESCROW_CHAIN_MISMATCH");
  }
  const base = {
    issueId: escrow.onChainIssueId ?? escrow.issueId,
    actorAddress: user.walletAddress,
  };
  const rawAmount = decimalAmountToRaw(escrow.bountyAmount.toFixed(), escrow.token.decimals);
  let expected: ExpectedEscrowEvent;
  switch (input.action) {
    case "RELEASE":
      expected = { ...base, kind: "RESOLVE", amount: rawAmount, resolutionKind: "RELEASE" };
      break;
    case "CANCEL":
      expected = {
        ...base,
        kind: "CANCEL",
        clientAddress: escrow.client.walletAddress,
        refundAmount: rawAmount,
      };
      break;
    case "WORK":
      expected = { ...base, kind: "WORK", deliveryHash: requiredHash(input.hash) };
      break;
    case "DISPUTE":
    case "COUNTERPARTY_EVIDENCE":
      expected = { ...base, kind: input.action, evidenceManifestHash: requiredHash(input.hash) };
      break;
    case "PROPOSE_SETTLEMENT":
      expected = { ...base, kind: "PROPOSE_SETTLEMENT", clientBps: requiredBps(input.clientBps) };
      break;
    case "REVOKE_SETTLEMENT":
    case "CHALLENGE":
      expected = { ...base, kind: input.action };
      break;
    case "INITIAL_RULING":
    case "FINAL_RULING":
      if (!escrow.arbiterAddress)
        throw gqlError("Escrow arbiter snapshot is missing", "ESCROW_INVALID_STATE");
      expected = {
        ...base,
        kind: input.action,
        arbiterAddress: escrow.arbiterAddress,
        clientBps: requiredBps(input.clientBps),
        decisionHash: requiredHash(input.hash),
      };
      break;
    default: {
      const resolutionKinds = {
        ACCEPT_SETTLEMENT: "SETTLEMENT",
        MISSED_DELIVERY_REFUND: "MISSED_DELIVERY_REFUND",
        REVIEW_TIMEOUT: "REVIEW_TIMEOUT",
        FINALIZE_RULING: "RULING",
        ARBITER_TIMEOUT_SPLIT: "ARBITER_TIMEOUT_SPLIT",
      } as const;
      expected = {
        ...base,
        kind: "RESOLVE",
        amount: rawAmount,
        resolutionKind: resolutionKinds[input.action],
      };
    }
  }
  const receipt = await verifyConfiguredEscrowTransaction(settings, input.txHash, expected);
  const eventWhere = {
    chainId_to_txHash_logIndex: {
      chainId: settings.chainId,
      to: settings.contractAddress.toLowerCase(),
      txHash: input.txHash.toLowerCase(),
      logIndex: receipt.logIndex,
    },
  };
  const replay = await ctx.db.transaction.findUnique({ where: eventWhere });
  if (replay) {
    if (replay.escrowId !== escrow.id || replay.type !== types[input.action])
      throw gqlError("Escrow event has already been used", "ESCROW_TRANSACTION_REPLAY");
    return escrow;
  }
  if (escrow.phase === EscrowPhase.RESOLVED)
    throw gqlError("Escrow is already resolved", "ESCROW_INVALID_STATE");
  if (!isNewerEscrowReceipt(receipt, escrow))
    throw gqlError("Confirm escrow receipts in chain order", "ESCROW_RECEIPT_OUT_OF_ORDER");
  await verifyEscrowLogContinuity(
    settings.rpcUrl,
    settings.chainId,
    settings.contractAddress,
    base.issueId,
    escrow,
    receipt,
  );
  const projection = projectEscrowReceipt(receipt, escrow.token.decimals, {
    proposedClientRatio: escrow.dispute?.proposedClientRatio?.toNumber() ?? null,
    finalClientRatio: escrow.dispute?.finalClientRatio?.toNumber() ?? null,
    settlementClientBps: escrow.settlementClientBps,
  });
  if (
    projection.dispute &&
    receipt.outcome !== "DISPUTED" &&
    receipt.outcome !== "RESOLVED" &&
    !escrow.dispute
  ) {
    throw gqlError("Confirm the dispute transaction first", "ESCROW_INVALID_STATE");
  }
  try {
    return await ctx.db.$transaction(
      async (tx) => {
        const updated = await tx.escrow.updateMany({
          where: {
            id: escrow.id,
            lastChainBlock: escrow.lastChainBlock,
            lastChainTransactionIndex: escrow.lastChainTransactionIndex,
            lastChainLogIndex: escrow.lastChainLogIndex,
            phase: escrow.phase,
          },
          data: {
            ...projection.escrow,
            ...(input.action === "RELEASE" ? { txHashRelease: input.txHash } : {}),
            ...(receipt.outcome === "RESOLVED" &&
            receipt.event.developerAmount.isZero() &&
            receipt.event.platformFee.isZero()
              ? { txHashCancel: input.txHash }
              : {}),
          },
        });
        if (updated.count !== 1)
          throw gqlError("Escrow state changed during confirmation", "ESCROW_STATE_CONFLICT");
        if (projection.issueStatus)
          await tx.issue.update({
            where: { id: escrow.issueId },
            data: {
              status: projection.issueStatus,
              ...(projection.issueStatus === "COMPLETED"
                ? { completedAt: new Date(receipt.blockTimestamp * 1000) }
                : {}),
            },
          });
        if (receipt.outcome === "DISPUTED") {
          if (!input.reason) throw gqlError("A dispute reason is required", "BAD_USER_INPUT");
          await tx.dispute.create({
            data: {
              issueId: escrow.issueId,
              escrowId: escrow.id,
              raisedById: user.id,
              reason: input.reason,
              createdAt: new Date(receipt.blockTimestamp * 1000),
              evidenceManifestHash: receipt.event.evidenceManifestHash,
              evidenceResponseDeadline: new Date((receipt.blockTimestamp + 72 * 3600) * 1000),
              arbiterTimeoutAt: new Date((receipt.blockTimestamp + 30 * 86400) * 1000),
            },
          });
        } else if (projection.dispute && escrow.dispute) {
          await tx.dispute.update({
            where: { id: escrow.dispute.id },
            data: {
              ...projection.dispute,
              ...(input.note ? { resolutionNote: input.note, resolvedById: user.id } : {}),
              ...(receipt.outcome === "CHALLENGED" ? { challengedById: user.id } : {}),
            },
          });
        }
        await tx.transaction.create({
          data: {
            escrowId: escrow.id,
            ...transactionData(input.txHash, projection.transactionType, receipt, settings),
          },
        });
        return tx.escrow.findUniqueOrThrow({ where: { id: escrow.id }, include: ESCROW_INCLUDE });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isEscrowConcurrencyError(error)) {
      const recorded = await ctx.db.transaction.findUnique({ where: eventWhere });
      if (recorded?.escrowId === escrow.id && recorded.type === types[input.action])
        return ctx.db.escrow.findUniqueOrThrow({
          where: { id: escrow.id },
          include: ESCROW_INCLUDE,
        });
      throw gqlError(
        "A concurrent escrow update was recorded; refresh before retrying",
        "ESCROW_STATE_CONFLICT",
      );
    }
    throw error;
  }
}

function requiredHash(hash: string | undefined): string {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash) || /^0x0{64}$/.test(hash))
    throw gqlError("A nonzero bytes32 hash is required", "BAD_USER_INPUT");
  return hash;
}
function requiredBps(bps: number | undefined): number {
  if (bps === undefined || !Number.isInteger(bps) || bps < 0 || bps > 10000)
    throw gqlError("clientBps must be between 0 and 10000", "BAD_USER_INPUT");
  return bps;
}

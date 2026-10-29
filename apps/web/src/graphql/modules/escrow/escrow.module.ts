import {
  EscrowStatus,
  EscrowPhase,
  EscrowResolutionKind,
  IssueStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "@bloody-roar/database";
import { Contract, providers, utils } from "ethers";
import { ESCROW_ABI, ESCROW_REVIEW_DAYS } from "@bloody-roar/shared";
import {
  ESCROW_INCLUDE,
  ESCROW_ACTIONS,
  confirmEscrowAction,
  transactionData,
} from "../../../lib/escrow/confirmation";
export { ESCROW_INCLUDE } from "../../../lib/escrow/confirmation";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { createNotificationSafely } from "../../../lib/services/notifications";
import { decimalAmountToRaw } from "../../../lib/escrow/amounts";
import {
  assertEscrowAccess,
  EscrowAccessError,
  type EscrowAction,
} from "../../../lib/escrow/access";
import {
  getEscrowChainSettings,
  verifyConfiguredEscrowTransaction,
  isEscrowConcurrencyError,
} from "../../../lib/escrow/integration";
import { UserRef } from "../user/user.module";

const EscrowStatusEnum = builder.enumType(EscrowStatus, { name: "EscrowStatus" });
const TransactionTypeEnum = builder.enumType(TransactionType, { name: "EscrowTransactionType" });
const TransactionStatusEnum = builder.enumType(TransactionStatus, {
  name: "EscrowTransactionStatus",
});

const EscrowPhaseEnum = builder.enumType(EscrowPhase, { name: "EscrowPhase" });
const ResolutionKindEnum = builder.enumType(EscrowResolutionKind, { name: "EscrowResolutionKind" });

const TransactionRef = builder.prismaObject("Transaction", {
  fields: (t) => ({
    id: t.exposeID("id"),
    txHash: t.exposeString("txHash"),
    type: t.expose("type", { type: TransactionTypeEnum }),
    status: t.expose("status", { type: TransactionStatusEnum }),
    from: t.exposeString("from", { nullable: true }),
    to: t.exposeString("to", { nullable: true }),
    blockNumber: t.exposeInt("blockNumber", { nullable: true }),
    blockHash: t.exposeString("blockHash", { nullable: true }),
    confirmations: t.exposeInt("confirmations", { nullable: true }),
    gasUsed: t.string({
      nullable: true,
      resolve: (transaction) => transaction.gasUsed?.toString() ?? null,
    }),
    gasPrice: t.string({
      nullable: true,
      resolve: (transaction) => transaction.gasPrice?.toString() ?? null,
    }),
    chainId: t.exposeInt("chainId"),
    createdAt: t.string({ resolve: (transaction) => transaction.createdAt.toISOString() }),
  }),
});

export const EscrowRef = builder.prismaObject("Escrow", {
  include: ESCROW_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    issueId: t.exposeString("issueId"),
    status: t.expose("status", { type: EscrowStatusEnum }),
    phase: t.expose("phase", { type: EscrowPhaseEnum }),
    resolutionKind: t.expose("resolutionKind", { type: ResolutionKindEnum }),
    arbiterAddress: t.exposeString("arbiterAddress", { nullable: true }),
    feeRecipientAddress: t.exposeString("feeRecipientAddress", { nullable: true }),
    termsHash: t.exposeString("termsHash", { nullable: true }),
    deliveryHash: t.exposeString("deliveryHash", { nullable: true }),
    settlementProposer: t.exposeString("settlementProposer", { nullable: true }),
    settlementClientBps: t.exposeInt("settlementClientBps", { nullable: true }),
    deliveryDeadline: t.string({
      nullable: true,
      resolve: (e) => e.deliveryDeadline?.toISOString() ?? null,
    }),
    reviewDeadline: t.string({
      nullable: true,
      resolve: (e) => e.reviewDeadline?.toISOString() ?? null,
    }),
    resolvedAt: t.string({ nullable: true, resolve: (e) => e.resolvedAt?.toISOString() ?? null }),
    contractAddress: t.exposeString("contractAddress", { nullable: true }),
    onChainIssueId: t.exposeString("onChainIssueId", { nullable: true }),
    txHashDeposit: t.exposeString("txHashDeposit", { nullable: true }),
    txHashRelease: t.exposeString("txHashRelease", { nullable: true }),
    txHashCancel: t.exposeString("txHashCancel", { nullable: true }),
    bountyAmount: t.float({ resolve: (escrow) => escrow.bountyAmount.toNumber() }),
    platformFeeAmount: t.float({ resolve: (escrow) => escrow.platformFeeAmount.toNumber() }),
    developerPayout: t.float({ resolve: (escrow) => escrow.developerPayout.toNumber() }),
    clientRefund: t.float({ resolve: (escrow) => escrow.clientRefund.toNumber() }),
    platformFeeBps: t.exposeInt("platformFeeBps"),
    depositedAt: t.string({
      nullable: true,
      resolve: (escrow) => escrow.depositedAt?.toISOString() ?? null,
    }),
    releasedAt: t.string({
      nullable: true,
      resolve: (escrow) => escrow.releasedAt?.toISOString() ?? null,
    }),
    timeoutClaimAt: t.string({
      nullable: true,
      resolve: (escrow) => escrow.timeoutClaimAt?.toISOString() ?? null,
    }),
    client: t.field({ type: UserRef, resolve: (escrow) => escrow.client }),
    developer: t.field({ type: UserRef, resolve: (escrow) => escrow.developer }),
    transactions: t.field({ type: [TransactionRef], resolve: (escrow) => escrow.transactions }),
  }),
});

const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");
const IdSchema = z.string().min(1).max(191);

function enforceEscrowAccess(
  userId: string,
  action: EscrowAction,
  escrow: { clientId: string; developerId: string },
): void {
  try {
    assertEscrowAccess(userId, action, escrow);
  } catch (error) {
    if (error instanceof EscrowAccessError) throw gqlError(error.message, error.code);
    throw error;
  }
}

builder.queryField("escrow", (t) =>
  t.prismaField({
    type: EscrowRef,
    nullable: true,
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const escrow = await ctx.db.escrow.findUnique({
        ...query,
        where: { issueId: args.issueId },
        include: ESCROW_INCLUDE,
      });
      if (!escrow) return null;
      if (user.role !== "ADMIN" && escrow.clientId !== user.id && escrow.developerId !== user.id) {
        throw gqlError("You are not allowed to view this escrow", "FORBIDDEN");
      }
      return escrow;
    },
  }),
);

builder.mutationField("depositToEscrow", (t) =>
  t.fieldWithInput({
    type: EscrowRef,
    typeOptions: { name: "DepositToEscrowInput" },
    input: {
      issueId: t.input.id({ required: true }),
      developerId: t.input.id({ required: true }),
      txHash: t.input.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(
        z.object({ issueId: IdSchema, developerId: IdSchema, txHash: TxHashSchema }),
        {
          issueId: String(args.input.issueId),
          developerId: String(args.input.developerId),
          txHash: args.input.txHash,
        },
      );
      const existingTx = await ctx.db.transaction.findFirst({
        where: {
          txHash: input.txHash.toLowerCase(),
          type: TransactionType.DEPOSIT,
          escrow: { issueId: input.issueId },
        },
        include: { escrow: true },
      });
      if (existingTx) {
        if (
          existingTx.type !== TransactionType.DEPOSIT ||
          existingTx.escrow.issueId !== input.issueId
        ) {
          throw gqlError("Transaction hash has already been used", "ESCROW_TRANSACTION_REPLAY");
        }
        enforceEscrowAccess(user.id, "DEPOSIT", existingTx.escrow);
        return ctx.db.escrow.findUniqueOrThrow({
          where: { id: existingTx.escrowId },
          include: ESCROW_INCLUDE,
        });
      }

      const issue = await ctx.db.issue.findUnique({
        where: { id: input.issueId },
        include: { token: true, client: true, developer: true, escrow: true },
      });
      if (!issue) throw gqlError("Issue not found", "NOT_FOUND");
      if (!issue.developerId)
        throw gqlError("Issue has no assigned developer", "INVALID_ESCROW_ASSIGNMENT");
      enforceEscrowAccess(user.id, "DEPOSIT", {
        clientId: issue.clientId,
        developerId: issue.developerId,
      });
      if (
        issue.status !== IssueStatus.IN_PROGRESS ||
        !issue.developer ||
        issue.developerId !== input.developerId
      ) {
        throw gqlError("Issue assignment does not match this deposit", "INVALID_ESCROW_ASSIGNMENT");
      }
      if (issue.escrow)
        throw gqlError("Escrow already exists for this issue", "ESCROW_ALREADY_EXISTS");

      const settings = getEscrowChainSettings();
      if (issue.token.chainId !== settings.chainId)
        throw gqlError("Issue token is configured for a different chain", "ESCROW_CHAIN_MISMATCH");
      if (issue.token.decimals !== 6)
        throw gqlError("Escrow token must have six decimals", "ESCROW_TOKEN_MISMATCH");
      const rawAmount = decimalAmountToRaw(issue.bountyAmount.toFixed(), issue.token.decimals);
      const receipt = await verifyConfiguredEscrowTransaction(settings, input.txHash, {
        kind: "DEPOSIT",
        issueId: issue.id,
        actorAddress: user.walletAddress,
        clientAddress: issue.client.walletAddress,
        developerAddress: issue.developer.walletAddress,
        tokenAddress: issue.token.address,
        amount: rawAmount,
      });
      if (receipt.outcome !== "DEPOSITED")
        throw gqlError("Invalid deposit event", "INVALID_ESCROW_TRANSACTION");
      const depositedAt = new Date(receipt.blockTimestamp * 1000);
      const deliveryDeadline = new Date(receipt.event.deliveryDeadline * 1000);
      const reviewDeadline = new Date(
        (receipt.event.deliveryDeadline + ESCROW_REVIEW_DAYS * 86400) * 1000,
      );

      try {
        const result = await ctx.db.$transaction(
          async (tx) => {
            const claim = await tx.issue.updateMany({
              where: {
                id: issue.id,
                status: IssueStatus.IN_PROGRESS,
                developerId: input.developerId,
                escrow: null,
              },
              data: { updatedAt: new Date() },
            });
            if (claim.count !== 1)
              throw gqlError(
                "Issue escrow state changed before confirmation",
                "ESCROW_STATE_CONFLICT",
              );
            return tx.escrow.create({
              data: {
                issueId: issue.id,
                clientId: issue.clientId,
                developerId: input.developerId,
                tokenId: issue.tokenId,
                bountyAmount: issue.bountyAmount,
                contractAddress: settings.contractAddress,
                onChainIssueId: issue.id,
                txHashDeposit: input.txHash,
                depositedAt,
                deliveryDeadline,
                reviewDeadline,
                timeoutClaimAt: reviewDeadline,
                arbiterAddress: receipt.event.arbiterAddress,
                feeRecipientAddress: receipt.event.feeRecipientAddress,
                termsHash: receipt.event.termsHash,
                phase: EscrowPhase.FUNDED,
                lastChainBlock: receipt.blockNumber,
                lastChainTransactionIndex: receipt.transactionIndex,
                lastChainLogIndex: receipt.logIndex,
                transactions: {
                  create: transactionData(input.txHash, TransactionType.DEPOSIT, receipt, settings),
                },
              },
              include: ESCROW_INCLUDE,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        
        await createNotificationSafely(ctx.db, {
          userId: input.developerId,
          type: "TASK_ASSIGNED",
          title: "Tiền ký quỹ đã được nạp",
          body: `Khách hàng đã nạp tiền ký quỹ (Escrow) cho “${issue.title}”. Bạn có thể bắt đầu công việc ngay bây giờ.`,
          actorId: user.id,
          link: `/issues/${issue.id}`,
          data: { issueId: issue.id, escrowId: result.id },
        });
        
        return result;
      } catch (error) {
        if (isEscrowConcurrencyError(error)) {
          const recorded = await ctx.db.transaction.findFirst({
            where: {
              txHash: input.txHash.toLowerCase(),
              type: TransactionType.DEPOSIT,
              escrow: { issueId: input.issueId },
            },
            include: { escrow: true },
          });
          if (
            recorded?.type === TransactionType.DEPOSIT &&
            recorded.escrow.issueId === input.issueId
          ) {
            return ctx.db.escrow.findUniqueOrThrow({
              where: { id: recorded.escrowId },
              include: ESCROW_INCLUDE,
            });
          }
          throw gqlError(
            "A concurrent escrow update was recorded; refresh before retrying",
            "ESCROW_STATE_CONFLICT",
          );
        }
        throw error;
      }
    },
  }),
);

const ConfirmActionEnum = builder.enumType("EscrowConfirmationAction", {
  values: ESCROW_ACTIONS.filter((action) => action !== "DISPUTE"),
});
builder.mutationField("confirmEscrowTransaction", (t) =>
  t.fieldWithInput({
    type: EscrowRef,
    typeOptions: { name: "ConfirmEscrowTransactionInput" },
    input: {
      issueId: t.input.id({ required: true }),
      txHash: t.input.string({ required: true }),
      action: t.input.field({ type: ConfirmActionEnum, required: true }),
      commitmentHash: t.input.string(),
      clientBps: t.input.int(),
    },
    resolve: (_root, args, ctx) => {
      const input = parseOrThrow(z.object({ issueId: IdSchema, txHash: TxHashSchema }), {
        issueId: String(args.input.issueId),
        txHash: args.input.txHash,
      });
      return confirmEscrowAction(ctx, {
        ...input,
        action: args.input.action,
        ...(args.input.commitmentHash != null ? { hash: args.input.commitmentHash } : {}),
        ...(args.input.clientBps != null ? { clientBps: args.input.clientBps } : {}),
      });
    },
  }),
);

for (const [name, inputName, action] of [
  ["releaseFunds", "ReleaseEscrowFundsInput", "RELEASE"],
  ["cancelEscrow", "CancelEscrowInput", "CANCEL"],
] as const) {
  builder.mutationField(name, (t) =>
    t.fieldWithInput({
      type: EscrowRef,
      typeOptions: { name: inputName },
      input: {
        issueId: t.input.id({ required: true }),
        txHash: t.input.string({ required: true }),
      },
      resolve: (_root, args, ctx) =>
        confirmEscrowAction(ctx, {
          ...parseOrThrow(z.object({ issueId: IdSchema, txHash: TxHashSchema }), {
            issueId: String(args.input.issueId),
            txHash: args.input.txHash,
          }),
          action,
        }),
    }),
  );
}

const ClaimableRef = builder.objectRef<{
  rawAmount: string;
  amount: string;
  tokenAddress: string;
  contractAddress: string;
  chainId: number;
}>("EscrowClaimableBalance");
ClaimableRef.implement({
  fields: (t) => ({
    rawAmount: t.exposeString("rawAmount"),
    amount: t.exposeString("amount"),
    tokenAddress: t.exposeString("tokenAddress"),
    contractAddress: t.exposeString("contractAddress"),
    chainId: t.exposeInt("chainId"),
  }),
});
builder.queryField("escrowClaimableBalance", (t) =>
  t.field({
    type: ClaimableRef,
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx),
        settings = getEscrowChainSettings();
      try {
        const provider = new providers.JsonRpcProvider(settings.rpcUrl, settings.chainId);
        const contract = new Contract(settings.contractAddress, [...ESCROW_ABI], provider);
        const blockTag = await provider.getBlockNumber();
        const [tokenAddress, rawAmount] = await Promise.all([
          contract.token({ blockTag }),
          contract.claimable(user.walletAddress, { blockTag }),
        ]);
        return {
          rawAmount: rawAmount.toString(),
          amount: utils.formatUnits(rawAmount, 6),
          tokenAddress: utils.getAddress(tokenAddress),
          contractAddress: settings.contractAddress,
          chainId: settings.chainId,
        };
      } catch {
        throw gqlError("Unable to read claimable escrow balance", "ESCROW_RPC_UNAVAILABLE");
      }
    },
  }),
);

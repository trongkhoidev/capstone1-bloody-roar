import {
  EscrowStatus,
  EscrowPhase,
  EscrowResolutionKind,
  type Prisma,
  TransactionStatus,
  TransactionType,
} from "@bloody-roar/database";
import { Contract, providers, utils } from "ethers";
import { ESCROW_ABI } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { escrowTarget } from "../../../lib/escrow/prepare";
import { UserRef } from "../user/user.module";

const ESCROW_INCLUDE = {
  token: true,
  client: true,
  developer: true,
  transactions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
} satisfies Prisma.EscrowInclude;

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
      const user = requireAuth(ctx);
      const settings = escrowTarget();
      const rpcUrl = process.env.RPC_URL;
      if (!rpcUrl || !/^https?:\/\//.test(rpcUrl))
        throw gqlError("RPC_URL is invalid or missing", "ESCROW_NOT_CONFIGURED");
      try {
        const provider = new providers.JsonRpcProvider(rpcUrl, settings.chainId);
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

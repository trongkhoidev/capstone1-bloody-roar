// apps/web/src/graphql/modules/escrow/release.module.ts
// Lệnh release và claim (BE-33, BE-42, BE-45, BE-46, BE-48). Mỗi mutation chỉ kiểm điều kiện
// trên EscrowProjection rồi trả calldata qua createPreparedCall. Không đổi trạng thái tiền.

import { EscrowPhase } from "@bloody-roar/database";
import type { PreparedCall } from "@bloody-roar/shared/escrow";
import { builder } from "../../builder";
import type { GraphQLContext } from "../../context";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { readChainTime } from "../../../lib/escrow/chain-time";

const PreparedCallArgRef = builder
  .objectRef<{ name: string; value: string }>("PreparedCallArg")
  .implement({
    fields: (t) => ({
      name: t.exposeString("name"),
      value: t.exposeString("value"),
    }),
  });

// Lệnh on-chain để ví ký. Hết hạn theo expiresAt (mặc định 30 phút).
export const PreparedCallRef = builder.objectRef<PreparedCall>("PreparedCall").implement({
  description: "On-chain call prepared for the wallet to sign",
  fields: (t) => ({
    intentId: t.exposeID("intentId"),
    chainId: t.exposeInt("chainId"),
    contractAddress: t.exposeString("to"),
    method: t.exposeString("method"),
    data: t.exposeString("data"),
    value: t.exposeString("value"),
    expiresAt: t.exposeString("expiresAt"),
    args: t.field({
      type: [PreparedCallArgRef],
      resolve: (call) => Object.entries(call.args).map(([name, value]) => ({ name, value })),
    }),
  }),
});

export const ClaimableBalanceRef = builder.prismaObject("ClaimableBalance", {
  description: "Claimable balance of an address on an escrow contract",
  fields: (t) => ({
    chainId: t.exposeInt("chainId"),
    contractAddress: t.exposeString("contractAddress"),
    address: t.exposeString("address"),
    amountRaw: t.string({ resolve: (balance) => balance.amountRaw.toFixed() }),
    autoClaimPending: t.boolean({ resolve: (balance) => balance.autoClaimTxHash !== null && balance.amountRaw.gt(0) }),
  }),
});

const sameWallet = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Mọi mutation prepare đọc projection theo issue. Không có ký quỹ thì không chuẩn bị gì.
async function projectionFor(issueId: string, ctx: GraphQLContext) {
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection || !projection.escrowKey) throw gqlError("This bounty has no escrow yet", "NOT_FOUND");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
  return { ...projection, escrowKey: projection.escrowKey };
}

builder.mutationField("prepareReleaseFunds", (t) =>
  t.field({
    description: "Client prepares releaseFunds once the delivery is on-chain (BE-42)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }), deliveryHash: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (!sameWallet(projection.client, user.walletAddress))
        throw gqlError("Only the client can release the funds", "FORBIDDEN");
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Escrow is not in the FUNDED state", "INVALID_PHASE");
      if (!projection.deliveryHash)
        throw gqlError("No delivery on-chain yet", "NO_DELIVERY");
      if (args.deliveryHash.toLowerCase() !== projection.deliveryHash.toLowerCase())
        throw gqlError("A newer Submission was made. Refresh and review it before releasing", "DELIVERY_CHANGED");
      return createPreparedCall(ctx.db, {
        userId: user.id,
        method: "releaseFunds",
        args: { escrowId: projection.escrowKey, expectedDeliveryHash: projection.deliveryHash },
        issueId: projection.issueId,
      });
    },
  }),
);

// BE-45: không có bản giao và đã quá hạn giao. Hoàn tiền cho client.
builder.mutationField("prepareClaimMissedDeliveryRefund", (t) =>
  t.field({
    description: "Prepare a refund when the deadline passed with no delivery (BE-45)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Escrow is not in the FUNDED state", "INVALID_PHASE");
      if (projection.deliveryHash)
        throw gqlError("A delivery exists, so a refund is not possible", "DELIVERY_EXISTS");
      if (await readChainTime(projection.chainId) <= projection.deliveryDeadline)
        throw gqlError("The delivery deadline has not passed yet", "DEADLINE_NOT_REACHED");
      return createPreparedCall(ctx.db, {
        userId: user.id,
        method: "claimMissedDeliveryRefund",
        args: { escrowId: projection.escrowKey },
        issueId: projection.issueId,
      });
    },
  }),
);

// BE-46: đã có bản giao, client không duyệt trong cửa sổ review (7 ngày). Developer nhận tiền.
builder.mutationField("prepareClaimReviewTimeout", (t) =>
  t.field({
    description: "Prepare to claim when the review window ends (BE-46)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Escrow is not in the FUNDED state", "INVALID_PHASE");
      if (!projection.deliveryHash)
        throw gqlError("No delivery on-chain yet", "NO_DELIVERY");
      if (await readChainTime(projection.chainId) < projection.reviewDeadline)
        throw gqlError("The review window has not ended yet", "REVIEW_WINDOW_NOT_REACHED");
      return createPreparedCall(ctx.db, {
        userId: user.id,
        method: "claimReviewTimeout",
        args: { escrowId: projection.escrowKey },
        issueId: projection.issueId,
      });
    },
  }),
);

// BE-48: rút số dư claimable của chính mình. Contract trả claimable[recipient] cho recipient.
builder.mutationField("prepareClaim", (t) =>
  t.field({
    description: "Prepare a withdrawal of the user's claimable balance (BE-48)",
    type: PreparedCallRef,
    args: { recipient: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const recipient = String(args.recipient);
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient))
        throw gqlError("Invalid recipient address", "BAD_USER_INPUT");
      if (!sameWallet(recipient, user.walletAddress))
        throw gqlError("You can withdraw only your own wallet's balance", "FORBIDDEN");
      const target = escrowTarget();
      const balance = await ctx.db.claimableBalance.findFirst({
        where: {
          chainId: target.chainId,
          contractAddress: { equals: target.contractAddress, mode: "insensitive" },
          address: { equals: recipient, mode: "insensitive" },
        },
      });
      if (!balance || balance.amountRaw.isZero())
        throw gqlError("No balance to withdraw", "NOTHING_TO_CLAIM");
      return createPreparedCall(ctx.db, { userId: user.id, method: "claim", args: { recipient } });
    },
  }),
);

builder.queryField("myClaimable", (t) =>
  t.field({
    description: "The user's claimable balance on the configured escrow contract",
    type: [ClaimableBalanceRef],
    resolve: (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const target = escrowTarget();
      return ctx.db.claimableBalance.findMany({
        where: {
          chainId: target.chainId,
          contractAddress: { equals: target.contractAddress, mode: "insensitive" },
          address: { equals: user.walletAddress, mode: "insensitive" },
          amountRaw: { gt: 0 },
        },
      });
    },
  }),
);

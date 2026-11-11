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
  description: "Lệnh on-chain đã chuẩn bị để ví ký",
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
  description: "Số dư có thể rút của một địa chỉ trên một escrow contract",
  fields: (t) => ({
    chainId: t.exposeInt("chainId"),
    contractAddress: t.exposeString("contractAddress"),
    address: t.exposeString("address"),
    amountRaw: t.string({ resolve: (balance) => balance.amountRaw.toFixed() }),
  }),
});

const sameWallet = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Mọi mutation prepare đọc projection theo issue. Không có ký quỹ thì không chuẩn bị gì.
async function projectionFor(issueId: string, ctx: GraphQLContext) {
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection || !projection.escrowKey) throw gqlError("Bài toán chưa có ký quỹ", "NOT_FOUND");
  return { ...projection, escrowKey: projection.escrowKey };
}

builder.mutationField("prepareReleaseFunds", (t) =>
  t.field({
    description: "Client chuẩn bị releaseFunds khi đã có bản giao hàng trên chain (BE-42)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (!sameWallet(projection.client, user.walletAddress))
        throw gqlError("Chỉ khách hàng mới release được tiền", "FORBIDDEN");
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Ký quỹ không ở trạng thái FUNDED", "INVALID_PHASE");
      if (!projection.deliveryHash)
        throw gqlError("Chưa có bản giao hàng trên chain", "NO_DELIVERY");
      return createPreparedCall(ctx.db, {
        userId: user.id,
        method: "releaseFunds",
        args: { escrowId: projection.escrowKey },
        issueId: projection.issueId,
      });
    },
  }),
);

// BE-45: không có bản giao và đã quá hạn giao. Hoàn tiền cho client.
builder.mutationField("prepareClaimMissedDeliveryRefund", (t) =>
  t.field({
    description: "Client chuẩn bị hoàn tiền khi quá hạn giao mà chưa có bản giao (BE-45)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (!sameWallet(projection.client, user.walletAddress))
        throw gqlError("Chỉ khách hàng mới được hoàn tiền", "FORBIDDEN");
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Ký quỹ không ở trạng thái FUNDED", "INVALID_PHASE");
      if (projection.deliveryHash)
        throw gqlError("Đã có bản giao hàng, không thể hoàn tiền", "DELIVERY_EXISTS");
      if (new Date() <= projection.deliveryDeadline)
        throw gqlError("Chưa quá hạn giao hàng", "DEADLINE_NOT_REACHED");
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
    description: "Developer chuẩn bị nhận tiền khi hết cửa sổ review (BE-46)",
    type: PreparedCallRef,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await projectionFor(String(args.issueId), ctx);
      if (!sameWallet(projection.developer, user.walletAddress))
        throw gqlError("Chỉ developer mới được nhận tiền", "FORBIDDEN");
      if (projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Ký quỹ không ở trạng thái FUNDED", "INVALID_PHASE");
      if (!projection.deliveryHash)
        throw gqlError("Chưa có bản giao hàng trên chain", "NO_DELIVERY");
      if (new Date() < projection.reviewDeadline)
        throw gqlError("Chưa hết cửa sổ review", "REVIEW_WINDOW_NOT_REACHED");
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
    description: "Chuẩn bị rút số dư claimable của ví người dùng (BE-48)",
    type: PreparedCallRef,
    args: { recipient: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const recipient = String(args.recipient);
      if (!sameWallet(recipient, user.walletAddress))
        throw gqlError("Chỉ rút được số dư của ví mình", "FORBIDDEN");
      const target = escrowTarget();
      const balance = await ctx.db.claimableBalance.findFirst({
        where: {
          chainId: target.chainId,
          contractAddress: target.contractAddress,
          address: { equals: recipient, mode: "insensitive" },
        },
      });
      if (!balance || balance.amountRaw.isZero())
        throw gqlError("Không có số dư để rút", "NOTHING_TO_CLAIM");
      return createPreparedCall(ctx.db, { userId: user.id, method: "claim", args: { recipient } });
    },
  }),
);

builder.queryField("myClaimable", (t) =>
  t.field({
    description: "Số dư claimable của ví người dùng trên escrow contract đang cấu hình",
    type: [ClaimableBalanceRef],
    resolve: (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const target = escrowTarget();
      return ctx.db.claimableBalance.findMany({
        where: {
          chainId: target.chainId,
          contractAddress: target.contractAddress,
          address: { equals: user.walletAddress, mode: "insensitive" },
          amountRaw: { gt: 0 },
        },
      });
    },
  }),
);

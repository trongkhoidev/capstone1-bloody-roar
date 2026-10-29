import { EscrowPhase } from "@bloody-roar/database";
import { builder } from "../../builder";
import { requireAuth, type GraphQLContext } from "../../context";
import { gqlError } from "../../errors";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { PreparedCallRef } from "./release.module";

async function settlementProjection(ctx: GraphQLContext, issueId: string) {
  const user = requireAuth(ctx);
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection?.escrowKey) throw gqlError("Bài toán chưa có ký quỹ", "NOT_FOUND");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Ký quỹ không khớp cấu hình", "ESCROW_CHAIN_MISMATCH");
  const wallet = user.walletAddress.toLowerCase();
  if (wallet !== projection.client.toLowerCase() && wallet !== projection.developer.toLowerCase())
    throw gqlError("Chỉ các bên tham gia được thỏa thuận", "FORBIDDEN");
  if (projection.phase === EscrowPhase.RESOLVED || projection.phase === EscrowPhase.NONE)
    throw gqlError("Ký quỹ không thể thỏa thuận", "INVALID_PHASE");
  return { user, projection: { ...projection, escrowKey: projection.escrowKey }, wallet };
}

builder.mutationField("prepareProposeSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }), clientBps: t.arg.int({ required: true }) },
  resolve: async (_root, args, ctx) => {
    if (args.clientBps < 0 || args.clientBps > 10000) throw gqlError("Tỷ lệ phải từ 0 đến 10000", "INVALID_BASIS_POINTS");
    const { user, projection } = await settlementProjection(ctx, String(args.issueId));
    if (projection.settlementProposer) throw gqlError("Đã có đề xuất đang chờ", "SETTLEMENT_PENDING");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "proposeSettlement", args: { escrowId: projection.escrowKey, clientBps: String(args.clientBps) } });
  },
}));

builder.mutationField("prepareRevokeSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const { user, projection, wallet } = await settlementProjection(ctx, String(args.issueId));
    if (!projection.settlementProposer) throw gqlError("Không có đề xuất đang chờ", "NO_PENDING_SETTLEMENT");
    if (projection.settlementProposer.toLowerCase() !== wallet) throw gqlError("Chỉ người đề xuất được thu hồi", "FORBIDDEN");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "revokeSettlement", args: { escrowId: projection.escrowKey } });
  },
}));

builder.mutationField("prepareAcceptSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const { user, projection, wallet } = await settlementProjection(ctx, String(args.issueId));
    if (!projection.settlementProposer) throw gqlError("Không có đề xuất đang chờ", "NO_PENDING_SETTLEMENT");
    if (projection.settlementProposer.toLowerCase() === wallet) throw gqlError("Người đề xuất không thể tự chấp nhận", "FORBIDDEN");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "acceptSettlement", args: { escrowId: projection.escrowKey } });
  },
}));

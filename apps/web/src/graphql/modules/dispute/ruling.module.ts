import { encodeFunctionData } from "@bloody-roar/shared";
import { computeDecisionHash, ESCROW_ABI } from "@bloody-roar/shared/escrow";
import { builder } from "../../builder";
import { requireAdmin } from "../../context";
import { gqlError } from "../../errors";
import { readChainTime } from "../../../lib/escrow/chain-time";
import { escrowTarget } from "../../../lib/escrow/prepare";

const RulingKind = builder.enumType("RulingDraftKind", { values: ["INITIAL", "FINAL"] as const });
const RulingDraftResult = builder.objectRef<{ draftId: string; decisionHash: string; safeTransactionJson: string }>("RulingDraftResult").implement({ fields: (t) => ({
  draftId: t.exposeID("draftId"), decisionHash: t.exposeString("decisionHash"), safeTransactionJson: t.exposeString("safeTransactionJson"),
}) });

builder.mutationField("draftRuling", (t) => t.field({
  type: RulingDraftResult,
  args: { issueId: t.arg.id({ required: true }), clientBps: t.arg.int({ required: true }), rationale: t.arg.string({ required: true }), kind: t.arg({ type: RulingKind, required: true }) },
  resolve: async (_root, args, ctx) => {
    const admin = requireAdmin(ctx);
    if (args.clientBps < 0 || args.clientBps > 10_000 || args.rationale.length < 20 || args.rationale.length > 10_000)
      throw gqlError("Tỷ lệ hoặc lý do không hợp lệ", "BAD_USER_INPUT");
    const issueId = String(args.issueId);
    const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
    if (!projection?.escrowKey) throw gqlError("Bài toán chưa có ký quỹ", "NOT_FOUND");
    const target = escrowTarget();
    if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
      throw gqlError("Ký quỹ không khớp cấu hình", "ESCROW_CHAIN_MISMATCH");
    const now = await readChainTime(projection.chainId);
    const start = args.kind === "INITIAL" ? projection.disputeRaisedAt : projection.challengedAt;
    if ((args.kind === "INITIAL" ? projection.phase !== "DISPUTED" : projection.phase !== "CHALLENGED") || !start)
      throw gqlError("Trạng thái tranh chấp không hợp lệ", "INVALID_PHASE");
    const elapsed = now.getTime() - start.getTime();
    if (elapsed >= 30 * 86_400_000 || (args.kind === "INITIAL" && elapsed < 72 * 3_600_000) || elapsed < 0)
      throw gqlError("Ngoài thời hạn phán quyết", "DEADLINE_PASSED");
    const decisionHash = computeDecisionHash({ issueId, escrowId: projection.escrowKey, clientBps: args.clientBps, rationale: args.rationale });
    const draft = await ctx.db.$transaction(async (tx) => {
      const saved = await tx.rulingDraft.upsert({ where: { decisionHash }, update: {}, create: { issueId, kind: args.kind, clientBps: args.clientBps, rationale: args.rationale, decisionHash, draftedById: admin.id } });
      await tx.adminLog.create({ data: { adminId: admin.id, action: "draft_ruling", target: "issue", targetId: issueId, details: { kind: args.kind, clientBps: args.clientBps, decisionHash } } });
      return saved;
    });
    const data = encodeFunctionData({ abi: ESCROW_ABI, functionName: args.kind === "INITIAL" ? "postInitialRuling" : "postFinalRuling", args: [projection.escrowKey, BigInt(args.clientBps), decisionHash] });
    const safeTransactionJson = JSON.stringify({ version: "1.0", chainId: String(target.chainId), createdAt: Date.now(),
      meta: { name: `BloodyRoar ruling ${issueId}`, description: `${args.kind} clientBps=${args.clientBps}`, txBuilderVersion: "1.16.5", createdFromSafeAddress: projection.arbiter },
      transactions: [{ to: target.contractAddress, value: "0", data, contractMethod: null, contractInputsValues: null }] });
    return { draftId: draft.id, decisionHash, safeTransactionJson };
  },
}));

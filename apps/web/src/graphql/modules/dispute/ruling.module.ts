import {
  ARBITER_STALL_DAYS,
  DAY_MS,
  DISPUTE_CHALLENGE_DAYS,
  DISPUTE_FINAL_NOTICE_HOURS,
  HOUR_MS,
  encodeFunctionData,
} from "@bloody-roar/shared";
import { computeDecisionHash, ESCROW_ABI } from "@bloody-roar/shared/escrow";
import { builder } from "../../builder";
import type { GraphQLContext } from "../../context";
import { requireAdmin, requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { PreparedCallRef } from "../escrow/release.module";
import { rulingWindow } from "../../../lib/escrow/availability";
import { readChainTime } from "../../../lib/escrow/chain-time";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";

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
      throw gqlError("Invalid split or reason", "BAD_USER_INPUT");
    const issueId = String(args.issueId);
    const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
    if (!projection?.escrowKey) throw gqlError("This bounty has no escrow yet", "NOT_FOUND");
    const target = escrowTarget();
    if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
      throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
    const now = await readChainTime(projection.chainId);
    const window = rulingWindow(projection);
    if (window?.kind !== args.kind)
      throw gqlError("Invalid dispute state", "INVALID_PHASE");
    if (now < window.opensAt || now >= window.closesAt)
      throw gqlError("Outside the ruling window", "DEADLINE_PASSED");
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


async function rulingProjection(ctx: GraphQLContext, issueId: string) {
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection?.escrowKey) throw gqlError("This bounty has no escrow yet", "NOT_FOUND");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
  return { ...projection, escrowKey: projection.escrowKey };
}

for (const [field, method] of [["prepareChallengeRuling", "challengeRuling"], ["prepareFinalizeRuling", "finalizeRuling"], ["prepareFinalizeArbiterTimeoutSplit", "finalizeArbiterTimeoutSplit"]] as const) {
  builder.mutationField(field, (t) => t.field({
    type: PreparedCallRef, args: { issueId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const projection = await rulingProjection(ctx, String(args.issueId));
      if (method === "challengeRuling") {
        const wallet = user.walletAddress.toLowerCase();
        if (wallet !== projection.client.toLowerCase() && wallet !== projection.developer.toLowerCase())
          throw gqlError("This ruling cannot be appealed", "FORBIDDEN");
      }
      let deadline: Date;
      if (method === "finalizeArbiterTimeoutSplit") {
        const start = projection.phase === "DISPUTED" ? projection.disputeRaisedAt : projection.phase === "CHALLENGED" ? projection.challengedAt : null;
        if (!start) throw gqlError("Invalid dispute state", "INVALID_PHASE");
        deadline = new Date(start.getTime() + ARBITER_STALL_DAYS * DAY_MS);
      } else {
        const kind = projection.phase === "INITIAL_RULING" ? "INITIAL" : projection.phase === "FINAL_RULING" && method === "finalizeRuling" ? "FINAL" : null;
        if (!kind) throw gqlError("Invalid ruling state", "INVALID_PHASE");
        const ruling = await ctx.db.rulingRecord.findFirst({ where: { escrowIdHash: projection.escrowIdHash, kind }, orderBy: { postedAt: "desc" } });
        if (!ruling) throw gqlError("On-chain ruling not found", "NOT_FOUND");
        if (method === "challengeRuling") {
          const wallet = user.walletAddress.toLowerCase();
          const client = wallet === projection.client.toLowerCase(), developer = wallet === projection.developer.toLowerCase();
          if ((client && ruling.clientBps >= 10_000) || (developer && ruling.clientBps <= 0))
            throw gqlError("This ruling cannot be appealed", "FORBIDDEN");
        }
        deadline = new Date(ruling.postedAt.getTime() + (kind === "INITIAL" ? DISPUTE_CHALLENGE_DAYS * DAY_MS : DISPUTE_FINAL_NOTICE_HOURS * HOUR_MS));
      }
      const now = await readChainTime(projection.chainId);
      if (method === "challengeRuling" ? now >= deadline : now < deadline)
        throw gqlError("Outside the execution window", "DEADLINE_NOT_REACHED");
      return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method, args: { escrowId: projection.escrowKey } });
    },
  }));
}

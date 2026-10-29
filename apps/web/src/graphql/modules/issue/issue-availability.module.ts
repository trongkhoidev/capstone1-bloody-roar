import { builder } from "../../builder";
import type { GraphQLContext } from "../../context";
import { IssueRef } from "./issue.module";
import { FundingReservationRef } from "../escrow/reservation.module";
import { EscrowPhaseEnum, ResolutionKindEnum } from "../escrow/escrow.module";
import { SubmissionRef, SUBMISSION_INCLUDE } from "../submission/submission.module";
import { availableActions, type AvailableAction } from "../../../lib/escrow/availability";
import type { EscrowProjection, RulingRecord } from "@bloody-roar/database";

const ActionRef = builder.objectRef<AvailableAction>("EscrowAvailableAction").implement({ fields: (t) => ({
  action: t.exposeString("action"), enabledAt: t.exposeString("enabledAt", { nullable: true }), reasonDisabled: t.exposeString("reasonDisabled", { nullable: true }),
}) });
async function currentRuling(db: GraphQLContext["db"], p: EscrowProjection): Promise<RulingRecord | null> {
  if (p.phase !== "INITIAL_RULING" && p.phase !== "FINAL_RULING") return null;
  return db.rulingRecord.findFirst({ where: { escrowIdHash: p.escrowIdHash, kind: p.phase === "INITIAL_RULING" ? "INITIAL" : "FINAL" }, orderBy: { postedAt: "desc" } });
}
const EscrowProjectionRef = builder.prismaObject("EscrowProjection", { fields: (t) => ({
  id: t.exposeID("id"), escrowIdHash: t.exposeString("escrowIdHash"), escrowKey: t.exposeString("escrowKey", { nullable: true }),
  chainId: t.exposeInt("chainId"), contractAddress: t.exposeString("contractAddress"), client: t.exposeString("client"), developer: t.exposeString("developer"),
  arbiter: t.exposeString("arbiter"), feeRecipient: t.exposeString("feeRecipient"),
  amountRaw: t.string({ resolve: (p) => p.amountRaw.toFixed() }),
  clientAmountRaw: t.string({ nullable: true, resolve: (p) => p.clientAmountRaw?.toFixed() ?? null }),
  developerAmountRaw: t.string({ nullable: true, resolve: (p) => p.developerAmountRaw?.toFixed() ?? null }),
  platformFeeRaw: t.string({ nullable: true, resolve: (p) => p.platformFeeRaw?.toFixed() ?? null }),
  deliveryDeadline: t.string({ resolve: (p) => p.deliveryDeadline.toISOString() }), reviewDeadline: t.string({ resolve: (p) => p.reviewDeadline.toISOString() }),
  deliveryHash: t.exposeString("deliveryHash", { nullable: true }), externalDelivery: t.exposeBoolean("externalDelivery"),
  phase: t.expose("phase", { type: EscrowPhaseEnum }), resolutionKind: t.expose("resolutionKind", { type: ResolutionKindEnum }),
  settlementProposer: t.exposeString("settlementProposer", { nullable: true }), settlementClientBps: t.exposeInt("settlementClientBps", { nullable: true }),
  projectionVersion: t.exposeInt("projectionVersion"), orphan: t.exposeBoolean("orphan"),
  availableActions: t.field({ type: [ActionRef], resolve: async (p, _args, ctx) => availableActions(p, new Date(), await currentRuling(ctx.db, p)) }),
}) });

type Capabilities = { canApply: boolean; canSelect: boolean; canFund: boolean; canSubmit: boolean; canRelease: boolean; canDispute: boolean;
  canRequestChanges: boolean; canProposeSettlement: boolean; canRevokeSettlement: boolean; canAcceptSettlement: boolean;
  canSubmitEvidence: boolean; canChallengeRuling: boolean; canFinalizeRuling: boolean; canFinalizeArbiterTimeoutSplit: boolean;
  canClaimMissedDeliveryRefund: boolean; canClaimReviewTimeout: boolean; canPostInitialRuling: boolean; canPostFinalRuling: boolean };
const CapabilityRef = builder.objectRef<Capabilities>("ViewerCapabilities").implement({ fields: (t) => ({
  canApply: t.exposeBoolean("canApply"), canSelect: t.exposeBoolean("canSelect"), canFund: t.exposeBoolean("canFund"),
  canSubmit: t.exposeBoolean("canSubmit"), canRelease: t.exposeBoolean("canRelease"), canDispute: t.exposeBoolean("canDispute"),
  canRequestChanges: t.exposeBoolean("canRequestChanges"), canProposeSettlement: t.exposeBoolean("canProposeSettlement"),
  canRevokeSettlement: t.exposeBoolean("canRevokeSettlement"), canAcceptSettlement: t.exposeBoolean("canAcceptSettlement"),
  canSubmitEvidence: t.exposeBoolean("canSubmitEvidence"), canChallengeRuling: t.exposeBoolean("canChallengeRuling"),
  canFinalizeRuling: t.exposeBoolean("canFinalizeRuling"), canFinalizeArbiterTimeoutSplit: t.exposeBoolean("canFinalizeArbiterTimeoutSplit"),
  canClaimMissedDeliveryRefund: t.exposeBoolean("canClaimMissedDeliveryRefund"), canClaimReviewTimeout: t.exposeBoolean("canClaimReviewTimeout"),
  canPostInitialRuling: t.exposeBoolean("canPostInitialRuling"), canPostFinalRuling: t.exposeBoolean("canPostFinalRuling"),
}) });

builder.prismaObjectFields(IssueRef, (t) => ({
  escrow: t.field({ type: EscrowProjectionRef, nullable: true, resolve: (issue, _args, ctx) => ctx.db.escrowProjection.findUnique({ where: { issueId: issue.id } }) }),
  reservation: t.field({ type: FundingReservationRef, nullable: true, resolve: (issue, _args, ctx) => {
    if (!ctx.user) return null;
    return ctx.db.fundingReservation.findFirst({ where: { issueId: issue.id, status: { in: ["AWAITING_FUNDING", "FUNDED"] }, OR: [{ clientId: ctx.user.id }, { developerId: ctx.user.id }] }, orderBy: { createdAt: "desc" } });
  } }),
  latestSubmission: t.field({ type: SubmissionRef, nullable: true, resolve: (issue, _args, ctx) => {
    const user = ctx.user;
    if (!user || (user.role !== "ADMIN" && user.id !== issue.clientId && user.id !== issue.developerId)) return null;
    return ctx.db.submission.findFirst({ where: { issueId: issue.id, status: { in: user.id === issue.developerId ? ["DRAFT", "PENDING_CHAIN", "SUBMITTED", "SUPERSEDED"] : ["SUBMITTED", "SUPERSEDED"] } }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], include: SUBMISSION_INCLUDE });
  } }),
  viewerCapabilities: t.field({ type: CapabilityRef, resolve: async (issue, _args, ctx) => {
    const user = ctx.user, now = new Date();
    const enabledUser = !!user && !user.isBanned;
    const [projection, reservation, application] = await Promise.all([
      ctx.db.escrowProjection.findUnique({ where: { issueId: issue.id } }),
      user ? ctx.db.fundingReservation.findFirst({ where: { issueId: issue.id, status: "AWAITING_FUNDING", clientId: user.id }, orderBy: { createdAt: "desc" } }) : null,
      user ? ctx.db.application.findUnique({ where: { issueId_developerId: { issueId: issue.id, developerId: user.id } }, select: { status: true } }) : null,
    ]);
    const ruling = projection ? await currentRuling(ctx.db, projection) : null;
    const actions = projection ? availableActions(projection, now, ruling) : [];
    const enabled = (action: string) => actions.some((a) => a.action === action && !a.reasonDisabled);
    const wallet = enabledUser ? user!.walletAddress.toLowerCase() : "";
    const isClient = !!projection && wallet === projection.client.toLowerCase() && user?.id === issue.clientId;
    const isDeveloper = !!projection && wallet === projection.developer.toLowerCase() && user?.id === issue.developerId;
    const isParty = isClient || isDeveloper;
    const isArbiter = !!projection && wallet === projection.arbiter.toLowerCase();
    const proposer = projection?.settlementProposer?.toLowerCase();
    const reviewable = isClient && projection?.deliveryHash ? await ctx.db.submission.findFirst({ where: { issueId: issue.id, status: "SUBMITTED", deliveryHash: { equals: projection.deliveryHash, mode: "insensitive" } }, select: { id: true } }) : null;
    const challengePermitted = !!ruling && ((isClient && ruling.clientBps < 10000) || (isDeveloper && ruling.clientBps > 0));
    const open = issue.status === "OPEN" && !issue.isDraft && !issue.hiddenAt && (!issue.expiresAt || issue.expiresAt > now);
    return {
      canApply: enabledUser && user!.role !== "ADMIN" && open && user!.id !== issue.clientId && (!application || application.status === "WITHDRAWN"),
      canSelect: enabledUser && open && user!.id === issue.clientId,
      canFund: enabledUser && issue.status === "AWAITING_FUNDING" && !!reservation && reservation.expiresAt > now && user!.id === issue.clientId,
      canSubmit: isDeveloper && enabled("submitWork"), canRelease: isClient && enabled("releaseFunds"), canDispute: isParty && enabled("raiseDispute"),
      canRequestChanges: isClient && !!reviewable && projection?.phase === "FUNDED",
      canProposeSettlement: isParty && enabled("proposeSettlement"), canRevokeSettlement: isParty && !!proposer && wallet === proposer && enabled("revokeSettlement"),
      canAcceptSettlement: isParty && !!proposer && wallet !== proposer && enabled("acceptSettlement"),
      canSubmitEvidence: isParty && !!projection?.disputeRaisedBy && wallet !== projection.disputeRaisedBy.toLowerCase() && enabled("submitCounterpartyEvidence"),
      canChallengeRuling: challengePermitted && enabled("challengeRuling"), canFinalizeRuling: enabledUser && enabled("finalizeRuling"),
      canFinalizeArbiterTimeoutSplit: enabledUser && enabled("finalizeArbiterTimeoutSplit"),
      canClaimMissedDeliveryRefund: enabledUser && enabled("claimMissedDeliveryRefund"), canClaimReviewTimeout: enabledUser && enabled("claimReviewTimeout"),
      canPostInitialRuling: isArbiter && enabled("postInitialRuling"), canPostFinalRuling: isArbiter && enabled("postFinalRuling"),
    };
  } }),
}));

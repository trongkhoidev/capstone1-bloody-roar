import { createNotificationIdempotent, IntentStatus, type NotificationType, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { logger } from "../log";
import { notifyNotificationCreated } from "../indexer/notify";
import type { EffectMeta } from "./escrow";

type DisputeEffect = Extract<FoldEffect, { kind: "DISPUTE_RAISED" | "COUNTERPARTY_EVIDENCE_SUBMITTED" | "INITIAL_RULING_POSTED" | "RULING_CHALLENGED" | "FINAL_RULING_POSTED" }>;
const date = (seconds: bigint) => new Date(Number(seconds) * 1000);
const day = 86_400_000;

export async function applyDispute(tx: Prisma.TransactionClient, effect: DisputeEffect, meta: EffectMeta): Promise<void> {
  const projection = await tx.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: effect.escrowIdHash } });
  if (projection.chainId !== meta.chainId || projection.contractAddress.toLowerCase() !== meta.contractAddress.toLowerCase()) throw new Error("Dispute belongs to another chain or contract");
  if (!projection.issueId) return;
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { id: true, clientId: true, developerId: true } });
  const parties = [issue.clientId, issue.developerId].filter((id): id is string => !!id);
  const admins = async () => (await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((user) => user.id);
  const notify = async (userIds: string[], type: NotificationType, title: string) => {
    for (const userId of new Set(userIds)) {
      const dedupeKey = effect.kind === "DISPUTE_RAISED" ? `dispute:${effect.escrowIdHash}:raised:${userId}` : `${meta.chainEventId}:${userId}:${type}`;
      const notification = await createNotificationIdempotent(tx, { userId, type, title, body: title, link: `/issues/${issue.id}`,
        data: { issueId: issue.id, escrowIdHash: effect.escrowIdHash, chainEventId: meta.chainEventId }, dedupeKey });
      if (notification) await notifyNotificationCreated(tx, { userId, id: notification.id });
    }
  };
  const findUser = (wallet: string) => tx.user.findFirst({ where: { walletAddress: { equals: wallet, mode: "insensitive" } }, select: { id: true } });
  const attach = async (hash: string, disputeId: string) => tx.evidenceManifest.updateMany({ where: { issueId: issue.id, manifestHash: { equals: hash, mode: "insensitive" } }, data: { disputeId, onChainEventId: meta.chainEventId } });
  const now = date(meta.blockTimestamp);
  if (effect.kind === "DISPUTE_RAISED") {
    const raiser = await findUser(effect.raisedBy);
    if (!raiser) throw new Error("Dispute raiser has no matching user");
    const manifest = await tx.evidenceManifest.findFirst({ where: { issueId: issue.id, manifestHash: { equals: effect.evidenceManifestHash, mode: "insensitive" } } });
    const content = manifest?.manifest as { statement?: { text?: unknown } } | undefined;
    const reason = typeof content?.statement?.text === "string" ? content.statement.text : "(bằng chứng nộp ngoài hệ thống)";
    const values = { status: "OPEN" as const, phase: "DISPUTED" as const, raisedById: raiser.id, raisedAt: now, reason, evidenceManifestHash: effect.evidenceManifestHash,
      evidenceResponseDeadline: new Date(now.getTime() + 3 * day), arbiterTimeoutAt: new Date(now.getTime() + 30 * day) };
    const dispute = await tx.dispute.upsert({ where: { issueId: issue.id }, create: { issueId: issue.id, ...values }, update: values });
    await attach(effect.evidenceManifestHash, dispute.id);
    await tx.issue.update({ where: { id: issue.id }, data: { status: "DISPUTED" } });
    await notify([...parties.filter((id) => id !== raiser.id), ...await admins()], "DISPUTE_RAISED", "Tranh chấp đã được mở");
  } else {
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { issueId: issue.id } });
    if (effect.kind === "COUNTERPARTY_EVIDENCE_SUBMITTED") {
      await tx.dispute.update({ where: { id: dispute.id }, data: { counterpartyEvidenceHash: effect.evidenceManifestHash } });
      await attach(effect.evidenceManifestHash, dispute.id);
      await notify([dispute.raisedById], "EVIDENCE_SUBMITTED", "Đã nộp bằng chứng phản hồi");
    } else if (effect.kind === "RULING_CHALLENGED") {
      const challenger = await findUser(effect.challengedBy);
      if (!challenger) throw new Error("Ruling challenger has no matching user");
      const challengedAt = date(effect.challengedAt);
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: "CHALLENGED", phase: "CHALLENGED", challengedAt, challengedById: challenger.id, arbiterTimeoutAt: new Date(challengedAt.getTime() + 30 * day) } });
      await notify([...parties, ...await admins()], "RULING_CHALLENGED", "Phán quyết đã bị kháng cáo");
    } else {
      const initial = effect.kind === "INITIAL_RULING_POSTED";
      const endsAt = date(initial ? effect.challengeEndsAt : effect.noticeEndsAt);
      await tx.rulingRecord.create({ data: { escrowIdHash: effect.escrowIdHash, kind: initial ? "INITIAL" : "FINAL", clientBps: effect.clientBps, decisionHash: effect.decisionHash, arbiter: effect.arbiter.toLowerCase(), postedAt: now, noticeEndsAt: endsAt, chainEventId: meta.chainEventId } });
      await tx.dispute.update({ where: { id: dispute.id }, data: initial
        ? { status: "PROPOSED", phase: "INITIAL_RULING", proposedClientBps: effect.clientBps, initialDecisionHash: effect.decisionHash, proposedAt: now, challengeDeadline: endsAt }
        : { status: "FINAL_RULING", phase: "FINAL_RULING", finalClientBps: effect.clientBps, finalDecisionHash: effect.decisionHash, finalRulingAt: now, noticeDeadline: endsAt } });
      const known = await tx.rulingDraft.findUnique({ where: { decisionHash: effect.decisionHash } });
      if (!known) {
        logger.warn({ decisionHash: effect.decisionHash, escrowIdHash: effect.escrowIdHash }, "Unknown on-chain ruling decision hash");
        await tx.reconciliationFinding.create({ data: { escrowIdHash: effect.escrowIdHash, kind: "UNKNOWN_DECISION_HASH", expected: { knownDraft: true }, actual: { decisionHash: effect.decisionHash, chainEventId: meta.chainEventId }, blockNumber: meta.blockNumber } });
      }
      await notify(parties, "RULING_POSTED", "Phán quyết đã được công bố");
    }
  }
  const methods: Partial<Record<DisputeEffect["kind"], string>> = { DISPUTE_RAISED: "raiseDispute", COUNTERPARTY_EVIDENCE_SUBMITTED: "submitCounterpartyEvidence", RULING_CHALLENGED: "challengeRuling" };
  const method = methods[effect.kind];
  if (method && projection.escrowKey) await tx.transactionIntent.updateMany({ where: { escrowKey: projection.escrowKey, chainId: meta.chainId, contractAddress: { equals: meta.contractAddress, mode: "insensitive" }, method, txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] } }, data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
}

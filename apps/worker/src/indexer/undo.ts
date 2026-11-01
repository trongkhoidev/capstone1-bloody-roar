import { ApplicationStatus, IntentStatus, IssueStatus, ReservationStatus, recalcReputation, type Prisma } from "@bloody-roar/database";

export type DepositUndo = {
  reservation: { id: string; status: ReservationStatus; fundedAt: string | null };
  issue: { id: string; status: IssueStatus; developerId: string | null };
  applications: Array<{ id: string; status: ApplicationStatus }>;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};

export async function captureDepositUndo(tx: Prisma.TransactionClient, escrowIdHash: string): Promise<DepositUndo | null> {
  const reservation = await tx.fundingReservation.findUnique({ where: { escrowIdHash } });
  if (!reservation) return null;
  const [issue, applications, intents] = await Promise.all([
    tx.issue.findUniqueOrThrow({ where: { id: reservation.issueId }, select: { id: true, status: true, developerId: true } }),
    tx.application.findMany({ where: { issueId: reservation.issueId }, select: { id: true, status: true } }),
    tx.transactionIntent.findMany({ where: { escrowKey: reservation.escrowKey }, select: { id: true, status: true, confirmedByEventId: true } }),
  ]);
  return { reservation: { id: reservation.id, status: reservation.status, fundedAt: reservation.fundedAt?.toISOString() ?? null }, issue, applications, intents };
}

export async function undoDeposit(tx: Prisma.TransactionClient, eventId: string, snapshot: DepositUndo): Promise<void> {
  const reservation = await tx.fundingReservation.findUniqueOrThrow({ where: { id: snapshot.reservation.id } });
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: snapshot.issue.id } });
  if (![ReservationStatus.FUNDED, ReservationStatus.MISMATCHED, snapshot.reservation.status].includes(reservation.status)) {
    throw new Error("Cannot safely undo deposit: reservation changed since projection");
  }
  const unchanged = issue.status === snapshot.issue.status && issue.developerId === snapshot.issue.developerId;
  const funded = reservation.status === ReservationStatus.FUNDED && issue.status === IssueStatus.IN_PROGRESS && issue.developerId === reservation.developerId;
  const mismatched = reservation.status === ReservationStatus.MISMATCHED && issue.status === IssueStatus.OPEN && issue.developerId === snapshot.issue.developerId;
  if (!unchanged && !funded && !mismatched) throw new Error("Cannot safely undo deposit: issue changed since projection");
  for (const original of snapshot.applications) {
    const current = await tx.application.findUnique({ where: { id: original.id }, select: { status: true } });
    if (!current) throw new Error("Cannot safely undo deposit: application was removed");
    if (current.status === original.status) continue;
    const projected = original.status === ApplicationStatus.PENDING &&
      (original.id === reservation.applicationId ? current.status === ApplicationStatus.ACCEPTED : current.status === ApplicationStatus.REJECTED);
    if (!projected) throw new Error("Cannot safely undo deposit: application changed since projection");
    await tx.application.update({ where: { id: original.id }, data: { status: original.status } });
  }
  for (const original of snapshot.intents) {
    await tx.transactionIntent.updateMany({ where: { id: original.id, confirmedByEventId: eventId }, data: { status: original.status, confirmedByEventId: original.confirmedByEventId } });
  }
  await tx.fundingReservation.update({ where: { id: reservation.id }, data: { status: snapshot.reservation.status, fundedAt: snapshot.reservation.fundedAt ? new Date(snapshot.reservation.fundedAt) : null } });
  await tx.issue.update({ where: { id: issue.id }, data: { status: snapshot.issue.status, developerId: snapshot.issue.developerId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
}

export type WorkUndo = {
  issueId: string;
  submissions: Array<{ id: string; status: string; submittedAt: string; supersededAt: string | null; onChainEventId: string | null; changesRequested: boolean; reviewNotes: string | null; reviewedAt: string | null }>;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};

export async function captureWorkUndo(tx: Prisma.TransactionClient, escrowIdHash: string, deliveryHash: string): Promise<WorkUndo | null> {
  const projection = await tx.escrowProjection.findUnique({ where: { escrowIdHash } });
  if (!projection?.issueId || !projection.escrowKey) return null;
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${projection.issueId} FOR UPDATE`;
  const submissions = await tx.submission.findMany({ where: { issueId: projection.issueId, OR: [{ status: "SUBMITTED" }, { deliveryHash: { equals: deliveryHash, mode: "insensitive" } }] },
    select: { id: true, status: true, submittedAt: true, supersededAt: true, onChainEventId: true, changesRequested: true, reviewNotes: true, reviewedAt: true } });
  const intents = await tx.transactionIntent.findMany({ where: { escrowKey: projection.escrowKey, method: "submitWork" }, select: { id: true, status: true, confirmedByEventId: true } });
  return { issueId: projection.issueId, submissions: submissions.map((s) => ({ ...s, submittedAt: s.submittedAt.toISOString(), supersededAt: s.supersededAt?.toISOString() ?? null, reviewedAt: s.reviewedAt?.toISOString() ?? null })), intents };
}

export async function undoWork(tx: Prisma.TransactionClient, eventId: string, snapshot: WorkUndo): Promise<void> {
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${snapshot.issueId} FOR UPDATE`;
  for (const original of snapshot.submissions) {
    const current = await tx.submission.findUnique({ where: { id: original.id } });
    if (!current || current.changesRequested !== original.changesRequested || current.reviewNotes !== original.reviewNotes || current.reviewedAt?.toISOString() !== (original.reviewedAt ?? undefined))
      throw new Error("Cannot safely undo work submission: review changed since projection");
    const target = current.onChainEventId === eventId && current.status === "SUBMITTED";
    const superseded = current.status === "SUPERSEDED" && original.status === "SUBMITTED" && current.onChainEventId === original.onChainEventId;
    if (!target && !superseded) throw new Error("Cannot safely undo work submission: submission changed since projection");
    await tx.submission.update({ where: { id: original.id }, data: { status: original.status as import("@bloody-roar/database").SubmissionStatus,
      submittedAt: new Date(original.submittedAt), supersededAt: original.supersededAt ? new Date(original.supersededAt) : null, onChainEventId: original.onChainEventId } });
  }
  for (const intent of snapshot.intents) await tx.transactionIntent.updateMany({ where: { id: intent.id, confirmedByEventId: eventId }, data: { status: intent.status, confirmedByEventId: intent.confirmedByEventId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
}

export type ResolvedUndo = {
  issue: { id: string; status: IssueStatus; outcome: import("@bloody-roar/database").EscrowResolutionKind | null; completedAt: string | null } | null;
  resolution: import("@bloody-roar/database").EscrowResolutionKind;
  dispute?: DisputeUndo;
  settlement: { id: string; status: string; closedEventId: string | null } | null;
  credits: Array<{ address: string; amount: string }>;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};

export async function captureResolvedUndo(tx: Prisma.TransactionClient, effect: Extract<import("@bloody-roar/shared/escrow").FoldEffect, { kind: "ESCROW_RESOLVED" }>): Promise<ResolvedUndo> {
  const projection = await tx.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: effect.escrowIdHash } });
  if (projection.issueId) await tx.$queryRaw`SELECT id FROM issues WHERE id = ${projection.issueId} FOR UPDATE`;
  const issue = projection.issueId ? await tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { id: true, status: true, outcome: true, completedAt: true } }) : null;
  const intents = projection.issueId ? await tx.transactionIntent.findMany({ where: { issueId: projection.issueId, chainId: projection.chainId, contractAddress: { equals: projection.contractAddress, mode: "insensitive" } }, select: { id: true, status: true, confirmedByEventId: true } }) : [];
  const settlement = await tx.settlementProposal.findFirst({ where: { escrowIdHash: effect.escrowIdHash, status: "PENDING" }, select: { id: true, status: true, closedEventId: true } });
  const credits = new Map<string, bigint>();
  for (const [wallet, amount] of [[effect.client, effect.clientAmount], [effect.developer, effect.developerAmount], [effect.feeRecipient, effect.platformFee]] as const) {
    const address = wallet.toLowerCase();
    if (amount > 0n) credits.set(address, (credits.get(address) ?? 0n) + amount);
  }
  return { issue: issue ? { ...issue, completedAt: issue.completedAt?.toISOString() ?? null } : null, resolution: effect.resolution, settlement,
    credits: [...credits].map(([address, amount]) => ({ address, amount: amount.toString() })), intents,
    ...(["RULING", "ARBITER_TIMEOUT_SPLIT"].includes(effect.resolution) ? { dispute: await captureDisputeUndo(tx, effect.escrowIdHash) } : {}) };
}

export async function undoResolved(tx: Prisma.TransactionClient, eventId: string, snapshot: ResolvedUndo, chainId: number, contractAddress: string): Promise<void> {
  if (snapshot.issue) {
    await tx.$queryRaw`SELECT id FROM issues WHERE id = ${snapshot.issue.id} FOR UPDATE`;
    const current = await tx.issue.findUniqueOrThrow({ where: { id: snapshot.issue.id } });
    if (current.status !== IssueStatus.COMPLETED || current.outcome !== snapshot.resolution) throw new Error("Cannot safely undo resolution: issue changed since projection");
    await tx.issue.update({ where: { id: snapshot.issue.id }, data: { status: snapshot.issue.status, outcome: snapshot.issue.outcome, completedAt: snapshot.issue.completedAt ? new Date(snapshot.issue.completedAt) : null } });
    if (current.developerId) await recalcReputation(tx, current.developerId);
  }
  if (snapshot.settlement) {
    const restored = await tx.settlementProposal.updateMany({ where: { id: snapshot.settlement.id, closedEventId: eventId, status: { in: ["ACCEPTED", "VOIDED"] } }, data: { status: snapshot.settlement.status, closedEventId: snapshot.settlement.closedEventId } });
    if (!restored.count) throw new Error("Cannot safely undo settlement resolution");
  }
  for (const credit of snapshot.credits) {
    const updated = await tx.claimableBalance.updateMany({ where: { chainId, contractAddress: contractAddress.toLowerCase(), address: credit.address, amountRaw: { gte: credit.amount } }, data: { amountRaw: { decrement: credit.amount } } });
    if (!updated.count) throw new Error("Cannot safely undo resolution: claimable balance changed");
  }
  for (const intent of snapshot.intents) await tx.transactionIntent.updateMany({ where: { id: intent.id, confirmedByEventId: eventId }, data: { status: intent.status, confirmedByEventId: intent.confirmedByEventId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
  if (snapshot.dispute) await undoDispute(tx, eventId, snapshot.dispute);
}

export type SettlementUndo = {
  issueId: string | null;
  pending: { id: string; status: string; closedEventId: string | null } | null;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};
export async function captureSettlementUndo(tx: Prisma.TransactionClient, escrowIdHash: string): Promise<SettlementUndo> {
  const projection = await tx.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  if (projection.issueId) await tx.$queryRaw`SELECT id FROM issues WHERE id = ${projection.issueId} FOR UPDATE`;
  const pending = await tx.settlementProposal.findFirst({ where: { escrowIdHash, status: "PENDING" }, select: { id: true, status: true, closedEventId: true } });
  const intents = projection.escrowKey ? await tx.transactionIntent.findMany({ where: { escrowKey: projection.escrowKey }, select: { id: true, status: true, confirmedByEventId: true } }) : [];
  return { issueId: projection.issueId, pending, intents };
}
export async function undoSettlement(tx: Prisma.TransactionClient, eventId: string, snapshot: SettlementUndo): Promise<void> {
  if (snapshot.issueId) await tx.$queryRaw`SELECT id FROM issues WHERE id = ${snapshot.issueId} FOR UPDATE`;
  if (snapshot.pending) {
    const restored = await tx.settlementProposal.updateMany({ where: { id: snapshot.pending.id, status: "REVOKED", closedEventId: eventId }, data: { status: snapshot.pending.status, closedEventId: snapshot.pending.closedEventId } });
    if (!restored.count) throw new Error("Cannot safely undo settlement revocation");
  } else {
    const deleted = await tx.settlementProposal.deleteMany({ where: { proposedEventId: eventId, status: "PENDING" } });
    if (!deleted.count) throw new Error("Cannot safely undo settlement proposal");
  }
  for (const intent of snapshot.intents) await tx.transactionIntent.updateMany({ where: { id: intent.id, confirmedByEventId: eventId }, data: { status: intent.status, confirmedByEventId: intent.confirmedByEventId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
}

export type ClaimedUndo = {
  address: string;
  amount: string;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};
export async function captureClaimedUndo(tx: Prisma.TransactionClient, chainId: number, contractAddress: string, txHash: string, recipient: string, amount: bigint): Promise<ClaimedUndo> {
  const intents = await tx.transactionIntent.findMany({ where: { chainId, contractAddress: { equals: contractAddress, mode: "insensitive" }, method: "claim", txHash: txHash.toLowerCase() }, select: { id: true, status: true, confirmedByEventId: true } });
  return { address: recipient.toLowerCase(), amount: amount.toString(), intents };
}
export async function undoClaimed(tx: Prisma.TransactionClient, eventId: string, snapshot: ClaimedUndo, chainId: number, contractAddress: string): Promise<void> {
  const key = { chainId, contractAddress: contractAddress.toLowerCase(), address: snapshot.address };
  await tx.claimableBalance.upsert({ where: { chainId_contractAddress_address: key }, create: { ...key, amountRaw: snapshot.amount }, update: { amountRaw: { increment: snapshot.amount } } });
  for (const intent of snapshot.intents) await tx.transactionIntent.updateMany({ where: { id: intent.id, confirmedByEventId: eventId }, data: { status: intent.status, confirmedByEventId: intent.confirmedByEventId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
}

const disputeSelect = {
  id: true, status: true, reason: true, phase: true, raisedById: true, raisedAt: true,
  evidenceManifestHash: true, counterpartyEvidenceHash: true, evidenceResponseDeadline: true, arbiterTimeoutAt: true,
  proposedClientBps: true, initialDecisionHash: true, proposedAt: true, challengeDeadline: true,
  challengedAt: true, challengedById: true, finalClientBps: true, finalDecisionHash: true, finalRulingAt: true, noticeDeadline: true, resolvedAt: true,
} satisfies Prisma.DisputeSelect;
type DisputeSnapshot = Prisma.DisputeGetPayload<{ select: typeof disputeSelect }>;
export type DisputeUndo = {
  issue: { id: string; status: IssueStatus } | null;
  dispute: DisputeSnapshot | null;
  manifests: Array<{ id: string; disputeId: string | null; onChainEventId: string | null }>;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};

export async function captureDisputeUndo(tx: Prisma.TransactionClient, escrowIdHash: string): Promise<DisputeUndo> {
  const projection = await tx.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  if (!projection.issueId) return { issue: null, dispute: null, manifests: [], intents: [] };
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${projection.issueId} FOR UPDATE`;
  const [issue, dispute, manifests, intents] = await Promise.all([
    tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { id: true, status: true } }),
    tx.dispute.findUnique({ where: { issueId: projection.issueId }, select: disputeSelect }),
    tx.evidenceManifest.findMany({ where: { issueId: projection.issueId }, select: { id: true, disputeId: true, onChainEventId: true } }),
    tx.transactionIntent.findMany({ where: { issueId: projection.issueId, chainId: projection.chainId, contractAddress: { equals: projection.contractAddress, mode: "insensitive" } }, select: { id: true, status: true, confirmedByEventId: true } }),
  ]);
  // ChainEvent.args is JSON; dates are restored by Prisma from their ISO representation.
  return JSON.parse(JSON.stringify({ issue, dispute, manifests, intents })) as DisputeUndo;
}

export async function undoDispute(tx: Prisma.TransactionClient, eventId: string, snapshot: DisputeUndo): Promise<void> {
  if (!snapshot.issue) return;
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${snapshot.issue.id} FOR UPDATE`;
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: snapshot.issue.id }, select: { status: true } });
  if (issue.status !== snapshot.issue.status && issue.status !== IssueStatus.DISPUTED)
    throw new Error("Cannot safely undo dispute: issue changed since projection");
  for (const manifest of snapshot.manifests) await tx.evidenceManifest.updateMany({ where: { id: manifest.id, onChainEventId: eventId }, data: { disputeId: manifest.disputeId, onChainEventId: manifest.onChainEventId } });
  if (snapshot.dispute) {
    const { id, ...data } = snapshot.dispute;
    await tx.dispute.update({ where: { id }, data });
  } else {
    await tx.dispute.deleteMany({ where: { issueId: snapshot.issue.id } });
  }
  await tx.issue.update({ where: { id: snapshot.issue.id }, data: { status: snapshot.issue.status } });
  await tx.rulingRecord.deleteMany({ where: { chainEventId: eventId } });
  await tx.reconciliationFinding.deleteMany({ where: { kind: "UNKNOWN_DECISION_HASH", actual: { path: ["chainEventId"], equals: eventId } } });
  for (const intent of snapshot.intents) await tx.transactionIntent.updateMany({ where: { id: intent.id, confirmedByEventId: eventId }, data: { status: intent.status, confirmedByEventId: intent.confirmedByEventId } });
  await tx.notification.deleteMany({ where: { data: { path: ["chainEventId"], equals: eventId } } });
}

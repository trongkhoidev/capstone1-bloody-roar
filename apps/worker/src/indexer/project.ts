import { type Prisma } from "@bloody-roar/database";
import {
  decodeEscrowLog, ESCROW_DECODER_VERSION, ESCROW_CONSTANTS, foldEscrowEvent,
  type DecodedEscrowEvent, type EscrowState, type EventMeta, type FoldEffect, type Hex,
} from "@bloody-roar/shared/escrow";
import { applyFoldEffects } from "../effects";
import { notifyProjectionChanged } from "./notify";
import { captureDepositUndo, captureWorkUndo, captureResolvedUndo, captureSettlementUndo, captureClaimedUndo, captureDisputeUndo } from "./undo";
import type { RawLog } from "../chain/client";
import type { IndexerConfig } from "./checkpoint";

type StoredArgs = { topics: Hex[]; data: Hex; blockTimestamp: string };
const dayMs = 86_400_000;
const date = (seconds: bigint) => new Date(Number(seconds) * 1000);

export function decodeLog(log: RawLog): DecodedEscrowEvent {
  return decodeEscrowLog({ address: log.address as Hex, topics: log.topics as Hex[], data: log.data as Hex }, ESCROW_DECODER_VERSION);
}

function before(a: { blockNumber: bigint; txIndex: number; logIndex: number }, b: { blockNumber: bigint; txIndex: number; logIndex: number }): boolean {
  return a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && (a.txIndex < b.txIndex || (a.txIndex === b.txIndex && a.logIndex < b.logIndex)));
}

export function projectionFields(next: EscrowState, lastProjectedBlock: bigint, effects: FoldEffect[]) {
  const resolved = effects.find((effect) => effect.kind === "ESCROW_RESOLVED");
  return {
    client: next.client, developer: next.developer, arbiter: next.arbiter, feeRecipient: next.feeRecipient,
    amountRaw: next.amount.toString(), depositedAt: date(next.depositedAt), deliveryDeadline: date(next.deliveryDeadline),
    reviewDeadline: new Date(date(next.deliveryDeadline).getTime() + ESCROW_CONSTANTS.REVIEW_DAYS * dayMs),
    termsHash: next.termsHash, deliveryHash: next.deliveryHash, phase: next.phase, resolutionKind: next.resolutionKind,
    settlementProposer: next.settlement?.proposer ?? null, settlementClientBps: next.settlement?.clientBps ?? null,
    disputeRaisedBy: next.dispute?.raisedBy ?? null, disputeRaisedAt: next.dispute ? date(next.dispute.raisedAt) : null,
    raiserEvidenceHash: next.dispute?.raiserEvidenceHash ?? null, counterpartyEvidenceHash: next.dispute?.counterpartyEvidenceHash ?? null,
    challengedAt: next.dispute?.challengedAt ? date(next.dispute.challengedAt) : null,
    ...(resolved?.kind === "ESCROW_RESOLVED" ? { clientAmountRaw: resolved.clientAmount.toString(), developerAmountRaw: resolved.developerAmount.toString(), platformFeeRaw: resolved.platformFee.toString(), decisionHash: resolved.decisionHash } : {}),
    lastProjectedBlock: lastProjectedBlock,
  };
}

export async function projectLog(tx: Prisma.TransactionClient, config: IndexerConfig, log: RawLog, blockTimestamp: bigint): Promise<void> {
  const event = decodeLog(log);
  const position = { blockNumber: BigInt(log.blockNumber), txIndex: Number(BigInt(log.transactionIndex)), logIndex: Number(BigInt(log.logIndex)) };
  const key = { chainId: config.chainId, contractAddress: config.escrowAddress, txHash: log.transactionHash.toLowerCase(), logIndex: position.logIndex };
  const existing = await tx.chainEvent.findUnique({ where: { chainId_contractAddress_txHash_logIndex: key } });
  if (existing?.canonical && existing.blockHash.toLowerCase() === log.blockHash.toLowerCase()) return;
  const escrowIdHash = "escrowIdHash" in event ? event.escrowIdHash.toLowerCase() as Hex : null;
  let state: EscrowState | null = null;
  if (escrowIdHash) {
    const history = await tx.chainEvent.findMany({
      where: { chainId: config.chainId, contractAddress: config.escrowAddress, escrowIdHash, canonical: true },
      orderBy: [{ blockNumber: "asc" }, { txIndex: "asc" }, { logIndex: "asc" }],
    });
    for (const row of history) {
      if (!before(row, position)) continue;
      const args = row.args as unknown as StoredArgs;
      if (!args.blockTimestamp || !Array.isArray(args.topics) || typeof args.data !== "string") throw new Error("Stored event lacks replay data; rebuild the index before scanning");
      const previous = decodeEscrowLog({ address: config.escrowAddress as Hex, topics: args.topics, data: args.data }, row.decoderVersion);
      state = foldEscrowEvent(state, previous, {
        chainId: config.chainId, contractAddress: config.escrowAddress as Hex, blockNumber: row.blockNumber,
        blockHash: row.blockHash as Hex, txHash: row.txHash as Hex, txIndex: row.txIndex, logIndex: row.logIndex,
        blockTimestamp: BigInt(args.blockTimestamp),
      }).state;
    }
  }
  const meta: EventMeta = { chainId: config.chainId, contractAddress: config.escrowAddress as Hex, ...position,
    blockHash: log.blockHash as Hex, txHash: log.transactionHash as Hex, blockTimestamp };
  const folded = foldEscrowEvent(state, event, meta);
  const resolution = folded.effects.find((effect) => effect.kind === "ESCROW_RESOLVED");
  const disputeEvent = ["DisputeRaised", "CounterpartyEvidenceSubmitted", "InitialRulingPosted", "RulingChallenged", "FinalRulingPosted"].includes(event.name);
  const undo = disputeEvent && escrowIdHash ? await captureDisputeUndo(tx, escrowIdHash) : event.name === "Claimed" ? await captureClaimedUndo(tx, config.chainId, config.escrowAddress, log.transactionHash, event.recipient, event.amount) : resolution ? await captureResolvedUndo(tx, resolution) : (event.name === "SettlementProposed" || event.name === "SettlementRevoked") && escrowIdHash ? await captureSettlementUndo(tx, escrowIdHash) : event.name === "Deposited" && escrowIdHash ? await captureDepositUndo(tx, escrowIdHash) :
    event.name === "WorkSubmitted" && escrowIdHash ? await captureWorkUndo(tx, escrowIdHash, event.deliveryHash) : null;
  const args = { topics: log.topics, data: log.data, blockTimestamp: blockTimestamp.toString(), ...(undo ? { undo } : {}) };
  const row = await tx.chainEvent.upsert({
    where: { chainId_contractAddress_txHash_logIndex: key },
    create: { ...key, ...position, blockHash: log.blockHash, eventName: event.name, escrowIdHash,
      args, decoderVersion: ESCROW_DECODER_VERSION },
    update: { ...position, blockHash: log.blockHash, eventName: event.name, escrowIdHash, canonical: true,
      args, decoderVersion: ESCROW_DECODER_VERSION },
  });
  const previous = escrowIdHash ? await tx.escrowProjection.findUnique({ where: { escrowIdHash } }) : null;
  if (previous && (previous.chainId !== config.chainId || previous.contractAddress.toLowerCase() !== config.escrowAddress.toLowerCase())) {
    throw new Error("Escrow projection belongs to another chain or contract");
  }
  await applyFoldEffects(tx, folded.effects, { ...meta, chainEventId: row.id, escrowIdHash: escrowIdHash ?? "0x" });
  if (!escrowIdHash || !folded.state) return;
  const delivery = event.name === "WorkSubmitted" && previous?.issueId ? await tx.submission.findFirst({ where: { issueId: previous.issueId, deliveryHash: { equals: event.deliveryHash, mode: "insensitive" } }, select: { id: true } }) : null;
  const fields = { ...projectionFields(folded.state, meta.blockNumber, folded.effects), ...(event.name === "WorkSubmitted" ? { externalDelivery: !delivery } : {}) };
  const projection = await tx.escrowProjection.upsert({
    where: { escrowIdHash },
    create: { ...fields, escrowIdHash, chainId: config.chainId, contractAddress: config.escrowAddress, orphan: true, projectionVersion: 1 },
    update: { ...fields, projectionVersion: previous ? { increment: 1 } : 1 },
  });
  await notifyProjectionChanged(tx, { escrowId: projection.id, issueId: projection.issueId, projectionVersion: projection.projectionVersion });
}

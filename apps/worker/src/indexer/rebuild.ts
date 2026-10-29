import { ReservationStatus, type Prisma } from "@bloody-roar/database";
import { decodeEscrowLog, foldEscrowEvent, type EscrowState, type FoldEffect, type Hex } from "@bloody-roar/shared/escrow";
import type { IndexerConfig } from "./checkpoint";
import { notifyProjectionChanged } from "./notify";
import { projectionFields } from "./project";

type StoredArgs = { topics: Hex[]; data: Hex; blockTimestamp: string };

export async function rebuildEscrowProjection(tx: Prisma.TransactionClient, config: IndexerConfig, escrowIdHash: string): Promise<void> {
  const history = await tx.chainEvent.findMany({
    where: { chainId: config.chainId, contractAddress: config.escrowAddress, escrowIdHash, canonical: true },
    orderBy: [{ blockNumber: "asc" }, { txIndex: "asc" }, { logIndex: "asc" }],
  });
  const previous = await tx.escrowProjection.findUnique({ where: { escrowIdHash } });
  if (previous && (previous.chainId !== config.chainId || previous.contractAddress.toLowerCase() !== config.escrowAddress.toLowerCase())) {
    throw new Error("Escrow projection belongs to another chain or contract");
  }
  if (!history.length) {
    if (previous) {
      await tx.escrowProjection.delete({ where: { escrowIdHash } });
      await notifyProjectionChanged(tx, { escrowId: previous.id, issueId: previous.issueId, projectionVersion: previous.projectionVersion + 1 });
    }
    return;
  }
  let state: EscrowState | null = null;
  let effects: FoldEffect[] = [];
  for (const row of history) {
    const args = row.args as unknown as StoredArgs;
    if (!args.blockTimestamp || !Array.isArray(args.topics) || typeof args.data !== "string") throw new Error("Stored event lacks replay data; rebuild the index before scanning");
    const event = decodeEscrowLog({ address: config.escrowAddress as Hex, topics: args.topics, data: args.data }, row.decoderVersion);
    const folded = foldEscrowEvent(state, event, { chainId: config.chainId, contractAddress: config.escrowAddress as Hex, blockNumber: row.blockNumber, blockHash: row.blockHash as Hex, txHash: row.txHash as Hex, txIndex: row.txIndex, logIndex: row.logIndex, blockTimestamp: BigInt(args.blockTimestamp) });
    state = folded.state;
    effects = folded.effects;
  }
  if (!state) throw new Error("Canonical escrow history produced no state");
  const last = history[history.length - 1]!;
  const fields = projectionFields(state, last.blockNumber, effects);
  const reservation = await tx.fundingReservation.findUnique({ where: { escrowIdHash } });
  const linked = reservation && reservation.chainId === config.chainId && reservation.contractAddress.toLowerCase() === config.escrowAddress.toLowerCase() && reservation.status === ReservationStatus.FUNDED ? reservation : null;
  const projection = await tx.escrowProjection.upsert({
    where: { escrowIdHash },
    create: { ...fields, escrowIdHash, chainId: config.chainId, contractAddress: config.escrowAddress, escrowKey: linked?.escrowKey ?? null, issueId: linked?.issueId ?? null, reservationId: linked?.id ?? null, orphan: !linked, projectionVersion: 1 },
    update: { ...fields, projectionVersion: { increment: 1 } },
  });
  await notifyProjectionChanged(tx, { escrowId: projection.id, issueId: projection.issueId, projectionVersion: projection.projectionVersion });
}

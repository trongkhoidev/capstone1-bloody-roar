import { type Prisma, type PrismaClient } from "@bloody-roar/database";
import { decodeFunctionResult, encodeFunctionData, type Abi } from "@bloody-roar/shared";
import { compareProjectionWithChain, ESCROW_ABI, ESCROW_RESOLUTION_KINDS, type DisputeState, type EscrowPhase, type EscrowState, type Hex, type OnchainEscrowView } from "@bloody-roar/shared/escrow";
import { getBlockByNumber, getSafeBlock, type RpcClient } from "../chain/client";
import { loadCheckpoint, lockCheckpoint, type IndexerConfig } from "../indexer/checkpoint";

const abi: Abi = ESCROW_ABI;
const phases: EscrowPhase[] = ["NONE", "FUNDED", "DISPUTED", "INITIAL_RULING", "CHALLENGED", "FINAL_RULING", "RESOLVED"];
const zeroAddress = `0x${"00".repeat(20)}`;
const zeroHash = `0x${"00".repeat(32)}`;
const seconds = (value: Date) => BigInt(Math.floor(value.getTime() / 1000));
const nonzero = (value: Hex) => value.toLowerCase() !== zeroHash;

type ChainEscrow = { client: Hex; developer: Hex; arbiter: Hex; feeRecipient: Hex; amount: bigint; depositedAt: bigint; deliveryDeadline: bigint; termsHash: Hex; deliveryHash: Hex; phase: number; resolutionKind: number };
type ChainSettlement = { proposer: Hex; clientBps: bigint };
type ChainDispute = { raisedBy: Hex; raisedAt: bigint; raiserEvidenceHash: Hex; counterpartyEvidenceHash: Hex; initialClientBps: bigint; initialRulingAt: bigint; initialDecisionHash: Hex; challengedAt: bigint; finalClientBps: bigint; finalRulingAt: bigint; finalDecisionHash: Hex };

function disputeView(value: ChainDispute): DisputeState | null {
  if (value.raisedBy.toLowerCase() === zeroAddress) return null;
  return { raisedBy: value.raisedBy, raisedAt: value.raisedAt, raiserEvidenceHash: value.raiserEvidenceHash,
    counterpartyEvidenceHash: nonzero(value.counterpartyEvidenceHash) ? value.counterpartyEvidenceHash : null,
    initialClientBps: value.initialRulingAt ? Number(value.initialClientBps) : null,
    initialRulingAt: value.initialRulingAt || null, initialDecisionHash: nonzero(value.initialDecisionHash) ? value.initialDecisionHash : null,
    challengedAt: value.challengedAt || null, finalClientBps: value.finalRulingAt ? Number(value.finalClientBps) : null,
    finalRulingAt: value.finalRulingAt || null, finalDecisionHash: nonzero(value.finalDecisionHash) ? value.finalDecisionHash : null };
}

async function read(rpc: RpcClient, config: IndexerConfig, block: bigint, name: string, args: readonly unknown[] = []): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName: name, args });
  const result = await rpc.call<Hex>("eth_call", [{ to: config.escrowAddress, data }, `0x${block.toString(16)}`]);
  return decodeFunctionResult({ abi, functionName: name, data: result });
}

async function chainEscrow(rpc: RpcClient, config: IndexerConfig, block: bigint, key: string): Promise<OnchainEscrowView> {
  const [raw, settlement, dispute] = await Promise.all([
    read(rpc, config, block, "getEscrow", [key]) as Promise<ChainEscrow>,
    read(rpc, config, block, "getSettlement", [key]) as Promise<ChainSettlement>,
    read(rpc, config, block, "getDispute", [key]) as Promise<ChainDispute>,
  ]);
  const phase = phases[Number(raw.phase)], resolutionKind = ESCROW_RESOLUTION_KINDS[Number(raw.resolutionKind)];
  if (!phase || !resolutionKind) throw new Error("Unknown escrow phase or resolution from contract");
  return { client: raw.client, developer: raw.developer, arbiter: raw.arbiter, feeRecipient: raw.feeRecipient,
    amount: raw.amount, depositedAt: raw.depositedAt, deliveryDeadline: raw.deliveryDeadline, termsHash: raw.termsHash,
    deliveryHash: nonzero(raw.deliveryHash) ? raw.deliveryHash : null, phase, resolutionKind,
    settlement: settlement.proposer.toLowerCase() === zeroAddress ? null : { proposer: settlement.proposer, clientBps: Number(settlement.clientBps) },
    dispute: disputeView(dispute) };
}

type Finding = { escrowIdHash: string | null; kind: string; expected: Prisma.InputJsonValue; actual: Prisma.InputJsonValue };

export async function reconcileProjections({ db, rpc, config, now }: { db: PrismaClient; rpc: RpcClient; config: IndexerConfig; now: () => Date }): Promise<number | null> {
  const checkpoint = await loadCheckpoint(db, config);
  const safe = await getSafeBlock(rpc, config.finality);
  if (!safe || safe.number < config.escrowDeployBlock || checkpoint.lastScannedBlock !== safe.number) return null;
  if (checkpoint.lastCanonicalBlockHash.toLowerCase() !== safe.hash.toLowerCase()) throw new Error("Indexer checkpoint is not on the selected chain head");
  const projections = await db.escrowProjection.findMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
  const balances = await db.claimableBalance.findMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
  const prefix = `chain:${config.chainId}:${config.escrowAddress.toLowerCase()}:`;
  const findings: Finding[] = [];
  const checked = new Set<string>();
  for (const projection of projections) {
    if (projection.phase === "RESOLVED") continue;
    const scope = `${prefix}escrow:`;
    checked.add(`${scope}${projection.escrowIdHash}`);
    if (!projection.escrowKey) {
      findings.push({ escrowIdHash: projection.escrowIdHash, kind: `${scope}missingKey`, expected: { escrowKey: "known" }, actual: { escrowKey: null } });
      continue;
    }
    const rulings = await db.rulingRecord.findMany({ where: { escrowIdHash: projection.escrowIdHash }, orderBy: { postedAt: "desc" } });
    const initial = rulings.find((row) => row.kind === "INITIAL"), final = rulings.find((row) => row.kind === "FINAL");
    const dispute: DisputeState | null = projection.disputeRaisedBy && projection.disputeRaisedAt && projection.raiserEvidenceHash ? {
      raisedBy: projection.disputeRaisedBy as Hex, raisedAt: seconds(projection.disputeRaisedAt), raiserEvidenceHash: projection.raiserEvidenceHash as Hex,
      counterpartyEvidenceHash: projection.counterpartyEvidenceHash as Hex | null, initialClientBps: initial?.clientBps ?? null,
      initialRulingAt: initial ? seconds(initial.postedAt) : null, initialDecisionHash: (initial?.decisionHash as Hex | undefined) ?? null,
      challengedAt: projection.challengedAt ? seconds(projection.challengedAt) : null, finalClientBps: final?.clientBps ?? null,
      finalRulingAt: final ? seconds(final.postedAt) : null, finalDecisionHash: (final?.decisionHash as Hex | undefined) ?? null,
    } : null;
    const state: EscrowState = { escrowIdHash: projection.escrowIdHash as Hex, client: projection.client as Hex, developer: projection.developer as Hex,
      arbiter: projection.arbiter as Hex, feeRecipient: projection.feeRecipient as Hex, amount: BigInt(projection.amountRaw.toFixed()),
      depositedAt: seconds(projection.depositedAt), deliveryDeadline: seconds(projection.deliveryDeadline), termsHash: projection.termsHash as Hex,
      deliveryHash: projection.deliveryHash as Hex | null, phase: projection.phase, resolutionKind: projection.resolutionKind,
      settlement: projection.settlementProposer && projection.settlementClientBps !== null ? { proposer: projection.settlementProposer as Hex, clientBps: projection.settlementClientBps } : null,
      dispute };
    const onchain = await chainEscrow(rpc, config, safe.number, projection.escrowKey);
    for (const diff of compareProjectionWithChain(state, onchain)) {
      findings.push({ escrowIdHash: projection.escrowIdHash, kind: `${scope}${diff.field}`, expected: { value: diff.onchain }, actual: { value: diff.projection } });
    }
  }
  const addresses = new Set([...balances.map((row) => row.address.toLowerCase()), ...projections.flatMap((row) => [row.client, row.developer, row.feeRecipient].map((address) => address.toLowerCase()))]);
  const byAddress = new Map(balances.map((row) => [row.address.toLowerCase(), BigInt(row.amountRaw.toFixed())]));
  for (const address of addresses) {
    const chainBalance = await read(rpc, config, safe.number, "claimable", [address]) as bigint;
    const local = byAddress.get(address) ?? 0n;
    const kind = `${prefix}claimable:${address}`;
    checked.add(kind);
    if (local !== chainBalance) findings.push({ escrowIdHash: null, kind, expected: { value: chainBalance.toString() }, actual: { value: local.toString() } });
  }
  const solvent = await read(rpc, config, safe.number, "isSolvent") as boolean;
  const solventKind = `${prefix}solvency`;
  checked.add(solventKind);
  if (!solvent) findings.push({ escrowIdHash: null, kind: solventKind, expected: { solvent: true }, actual: { solvent: false } });
  const verified = await getBlockByNumber(rpc, safe.number);
  if (!verified || verified.hash.toLowerCase() !== safe.hash.toLowerCase()) throw new Error("Chain head changed while reconciling");
  await db.$transaction(async (tx) => {
    await lockCheckpoint(tx, config, checkpoint);
    await tx.$queryRaw`SELECT id FROM escrow_projections WHERE "chainId" = ${config.chainId} AND "contractAddress" = ${config.escrowAddress} FOR UPDATE`;
    await tx.$queryRaw`SELECT address FROM claimable_balances WHERE "chainId" = ${config.chainId} AND "contractAddress" = ${config.escrowAddress} FOR UPDATE`;
    const [currentProjections, currentBalances] = await Promise.all([
      tx.escrowProjection.findMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress }, select: { id: true, updatedAt: true } }),
      tx.claimableBalance.findMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress }, select: { address: true, updatedAt: true } }),
    ]);
    const projectionVersions = new Map(projections.map((row) => [row.id, row.updatedAt.getTime()]));
    const balanceVersions = new Map(balances.map((row) => [row.address, row.updatedAt.getTime()]));
    if (currentProjections.length !== projections.length || currentProjections.some((row) => projectionVersions.get(row.id) !== row.updatedAt.getTime()) ||
        currentBalances.length !== balances.length || currentBalances.some((row) => balanceVersions.get(row.address) !== row.updatedAt.getTime())) {
      throw new Error("Projection changed while reconciling; retry");
    }
    const open = await tx.reconciliationFinding.findMany({ where: { kind: { startsWith: prefix }, resolvedAt: null } });
    for (const old of open) {
      const scope = old.escrowIdHash ? `${prefix}escrow:${old.escrowIdHash}` : old.kind;
      if (!checked.has(scope)) continue;
      if (!findings.some((finding) => finding.escrowIdHash === old.escrowIdHash && finding.kind === old.kind)) {
        await tx.reconciliationFinding.update({ where: { id: old.id }, data: { resolvedAt: now() } });
      }
    }
    for (const finding of findings) {
      const old = open.find((row) => row.escrowIdHash === finding.escrowIdHash && row.kind === finding.kind);
      if (old) await tx.reconciliationFinding.update({ where: { id: old.id }, data: { expected: finding.expected, actual: finding.actual, blockNumber: safe.number } });
      else await tx.reconciliationFinding.create({ data: { ...finding, blockNumber: safe.number } });
    }
  }, { timeout: 30_000, isolationLevel: "Serializable" });
  return findings.length;
}

import { BigNumber, Contract, providers, utils } from "ethers";
import type { providers as ProviderTypes } from "ethers";
import {
  ESCROW_ABI,
  ESCROW_RESOLUTION_KINDS,
  type EscrowResolutionKind,
} from "@bloody-roar/shared";
export { ESCROW_ABI } from "@bloody-roar/shared";

const escrowInterface = new utils.Interface([...ESCROW_ABI]);
const ZERO_HASH = utils.hexZeroPad("0x00", 32);
type EventBase = { issueId: string; actorAddress: string };
export type ExpectedEscrowEvent = EventBase &
  (
    | {
        kind: "DEPOSIT";
        clientAddress: string;
        developerAddress: string;
        tokenAddress: string;
        amount: BigNumber;
      }
    | { kind: "RELEASE"; developerAddress: string; amount: BigNumber }
    | { kind: "CANCEL"; clientAddress: string; refundAmount: BigNumber }
    | { kind: "DISPUTE" | "COUNTERPARTY_EVIDENCE"; evidenceManifestHash: string }
    | { kind: "WORK"; deliveryHash: string }
    | { kind: "PROPOSE_SETTLEMENT"; clientBps: number }
    | { kind: "REVOKE_SETTLEMENT" | "CHALLENGE" }
    | {
        kind: "INITIAL_RULING" | "FINAL_RULING";
        arbiterAddress: string;
        clientBps: number;
        decisionHash: string;
      }
    | { kind: "RESOLVE"; amount: BigNumber; resolutionKind: EscrowResolutionKind }
  );

export type EscrowEvent =
  | {
      outcome: "DEPOSITED";
      event: {
        arbiterAddress: string;
        feeRecipientAddress: string;
        deliveryDeadline: number;
        termsHash: string;
      };
    }
  | { outcome: "WORK_SUBMITTED"; event: { deliveryHash: string } }
  | { outcome: "SETTLEMENT_PROPOSED"; event: { proposerAddress: string; clientBps: number } }
  | { outcome: "SETTLEMENT_REVOKED"; event: { proposerAddress: string } }
  | { outcome: "DISPUTED" | "COUNTERPARTY_EVIDENCE"; event: { evidenceManifestHash: string } }
  | {
      outcome: "INITIAL_RULING" | "FINAL_RULING";
      event: { clientBps: number; decisionHash: string; deadline: number };
    }
  | { outcome: "CHALLENGED"; event: { challengedAt: number } }
  | {
      outcome: "RESOLVED";
      event: {
        resolutionKind: EscrowResolutionKind;
        clientAmount: BigNumber;
        developerAmount: BigNumber;
        platformFee: BigNumber;
        decisionHash: string;
      };
    };

export type EscrowReceiptOutcome = EscrowEvent["outcome"];
export type VerifiedEscrowReceipt = {
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;
  logIndex: number;
  confirmations: number;
  from: string;
  gasPrice: BigNumber | null;
  gasUsed: BigNumber;
} & EscrowEvent;
export type LoadedEscrowReceipt = VerifiedEscrowReceipt & { blockTimestamp: number };

export class EscrowVerificationError extends Error {
  readonly code = "INVALID_ESCROW_TRANSACTION";
  constructor(message: string) {
    super(message);
    this.name = "EscrowVerificationError";
  }
}
export function sameAddress(actual: string, expected: string): boolean {
  try {
    return utils.getAddress(actual) === utils.getAddress(expected);
  } catch {
    return false;
  }
}
function sameHash(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase() && actual !== ZERO_HASH;
}
function matchEvent(
  parsed: utils.LogDescription,
  expected: ExpectedEscrowEvent,
): EscrowEvent | null {
  const a = parsed.args;
  const actorMatches = () => sameAddress(String(a[1]), expected.actorAddress);
  switch (expected.kind) {
    case "DEPOSIT":
      if (
        parsed.name !== "Deposited" ||
        !sameAddress(a[1], expected.clientAddress) ||
        !sameAddress(a[2], expected.developerAddress) ||
        !BigNumber.from(a[5]).eq(expected.amount)
      )
        return null;
      return {
        outcome: "DEPOSITED",
        event: {
          arbiterAddress: utils.getAddress(a[3]),
          feeRecipientAddress: utils.getAddress(a[4]),
          deliveryDeadline: BigNumber.from(a[6]).toNumber(),
          termsHash: a[7],
        },
      };
    case "WORK":
      return parsed.name === "WorkSubmitted" &&
        actorMatches() &&
        sameHash(a[2], expected.deliveryHash)
        ? { outcome: "WORK_SUBMITTED", event: { deliveryHash: a[2] } }
        : null;
    case "DISPUTE":
    case "COUNTERPARTY_EVIDENCE":
      return parsed.name ===
        (expected.kind === "DISPUTE" ? "DisputeRaised" : "CounterpartyEvidenceSubmitted") &&
        actorMatches() &&
        sameHash(a[2], expected.evidenceManifestHash)
        ? {
            outcome: expected.kind === "DISPUTE" ? "DISPUTED" : "COUNTERPARTY_EVIDENCE",
            event: { evidenceManifestHash: a[2] },
          }
        : null;
    case "PROPOSE_SETTLEMENT":
      return parsed.name === "SettlementProposed" &&
        actorMatches() &&
        BigNumber.from(a[2]).eq(expected.clientBps)
        ? {
            outcome: "SETTLEMENT_PROPOSED",
            event: { proposerAddress: utils.getAddress(a[1]), clientBps: expected.clientBps },
          }
        : null;
    case "REVOKE_SETTLEMENT":
      return parsed.name === "SettlementRevoked" && actorMatches()
        ? { outcome: "SETTLEMENT_REVOKED", event: { proposerAddress: utils.getAddress(a[1]) } }
        : null;
    case "CHALLENGE":
      return parsed.name === "RulingChallenged" && actorMatches()
        ? { outcome: "CHALLENGED", event: { challengedAt: BigNumber.from(a[2]).toNumber() } }
        : null;
    case "INITIAL_RULING":
    case "FINAL_RULING":
      return parsed.name ===
        (expected.kind === "INITIAL_RULING" ? "InitialRulingPosted" : "FinalRulingPosted") &&
        sameAddress(a[1], expected.arbiterAddress) &&
        BigNumber.from(a[2]).eq(expected.clientBps) &&
        sameHash(a[3], expected.decisionHash)
        ? {
            outcome: expected.kind,
            event: {
              clientBps: expected.clientBps,
              decisionHash: a[3],
              deadline: BigNumber.from(a[4]).toNumber(),
            },
          }
        : null;
    case "RELEASE":
    case "CANCEL":
    case "RESOLVE": {
      if (parsed.name !== "EscrowResolved") return null;
      const resolutionKind = ESCROW_RESOLUTION_KINDS[Number(a[1])];
      if (!resolutionKind || resolutionKind === "NONE") return null;
      const clientAmount = BigNumber.from(a[2]),
        developerAmount = BigNumber.from(a[3]),
        platformFee = BigNumber.from(a[4]);
      if (
        expected.kind === "RELEASE" &&
        (resolutionKind !== "RELEASE" ||
          !clientAmount.isZero() ||
          !developerAmount.eq(expected.amount))
      )
        return null;
      if (
        expected.kind === "CANCEL" &&
        (!["MISSED_DELIVERY_REFUND", "SETTLEMENT"].includes(resolutionKind) ||
          !clientAmount.eq(expected.refundAmount) ||
          !developerAmount.isZero() ||
          !platformFee.isZero())
      )
        return null;
      if (
        expected.kind === "RESOLVE" &&
        (resolutionKind !== expected.resolutionKind ||
          !clientAmount.add(developerAmount).add(platformFee).eq(expected.amount))
      )
        return null;
      return {
        outcome: "RESOLVED",
        event: { resolutionKind, clientAmount, developerAmount, platformFee, decisionHash: a[5] },
      };
    }
  }
}

export function verifyEscrowReceipt(
  receipt: ProviderTypes.TransactionReceipt,
  contractAddress: string,
  expected: ExpectedEscrowEvent,
  minConfirmations = 1,
): VerifiedEscrowReceipt {
  if (receipt.status !== 1) throw new EscrowVerificationError("Escrow transaction reverted");
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1)
    throw new EscrowVerificationError("Escrow confirmation policy is invalid");
  if (receipt.confirmations < minConfirmations)
    throw new EscrowVerificationError(
      `Escrow transaction is not confirmed; requires ${minConfirmations} confirmations`,
    );
  // Rulings can come through a Safe/relayer; timeout and finalization calls are permissionless.
  // Their authority is proven by trusted contract logs, not the outer transaction destination or sender.
  if (
    !["RESOLVE", "INITIAL_RULING", "FINAL_RULING"].includes(expected.kind) &&
    !sameAddress(receipt.from, expected.actorAddress)
  ) {
    throw new EscrowVerificationError(
      "Escrow transaction sender does not match the authenticated wallet",
    );
  }
  for (const log of receipt.logs) {
    if (
      log.removed ||
      !sameAddress(log.address, contractAddress) ||
      log.topics[1]?.toLowerCase() !== utils.id(expected.issueId).toLowerCase()
    )
      continue;
    let parsed: utils.LogDescription;
    try {
      parsed = escrowInterface.parseLog(log);
    } catch {
      continue;
    }
    const event = matchEvent(parsed, expected);
    if (event)
      return {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionIndex: receipt.transactionIndex,
        logIndex: log.logIndex,
        confirmations: receipt.confirmations,
        from: utils.getAddress(receipt.from),
        gasPrice: receipt.effectiveGasPrice ?? null,
        gasUsed: receipt.gasUsed,
        ...event,
      };
  }
  throw new EscrowVerificationError("Transaction does not contain the expected escrow event");
}

type ChainPosition = { blockNumber: number; transactionIndex: number; logIndex: number };
export type EscrowCursor = {
  lastChainBlock: number | null;
  lastChainTransactionIndex: number | null;
  lastChainLogIndex: number | null;
};
const after = (a: ChainPosition, b: ChainPosition) =>
  a.blockNumber > b.blockNumber ||
  (a.blockNumber === b.blockNumber &&
    (a.transactionIndex > b.transactionIndex ||
      (a.transactionIndex === b.transactionIndex && a.logIndex > b.logIndex)));

export function assertEscrowLogContinuity(
  logs: providers.Log[],
  contractAddress: string,
  issueId: string,
  cursor: EscrowCursor,
  target: ChainPosition,
): void {
  if (cursor.lastChainBlock === null)
    throw new EscrowVerificationError(
      "Escrow event cursor is missing; reconcile this legacy escrow first",
    );
  const position = {
    blockNumber: cursor.lastChainBlock,
    transactionIndex: cursor.lastChainTransactionIndex ?? -1,
    logIndex: cursor.lastChainLogIndex ?? -1,
  };
  for (const log of logs) {
    if (
      log.removed ||
      !sameAddress(log.address, contractAddress) ||
      log.topics[1]?.toLowerCase() !== utils.id(issueId).toLowerCase() ||
      !after(log, position) ||
      !after(target, log)
    )
      continue;
    try {
      escrowInterface.parseLog(log);
    } catch {
      continue;
    }
    throw new EscrowVerificationError("Confirm the preceding escrow event before this transaction");
  }
}

export async function verifyEscrowLogContinuity(
  rpcUrl: string,
  chainId: number,
  contractAddress: string,
  issueId: string,
  cursor: EscrowCursor,
  target: ChainPosition,
): Promise<void> {
  if (cursor.lastChainBlock === null)
    throw new EscrowVerificationError(
      "Escrow event cursor is missing; reconcile this legacy escrow first",
    );
  const provider = new providers.JsonRpcProvider(rpcUrl, chainId);
  // Bounded parallel ranges avoid one long serial scan after a multi-week timeout.
  for (let start = cursor.lastChainBlock; start <= target.blockNumber; start += 16000) {
    const ranges = Array.from({ length: 8 }, (_, index) => start + index * 2000).filter(
      (fromBlock) => fromBlock <= target.blockNumber,
    );
    const batches = await Promise.all(
      ranges.map((fromBlock) =>
        provider.getLogs({
          address: contractAddress,
          topics: [null, utils.id(issueId)],
          fromBlock,
          toBlock: Math.min(fromBlock + 1999, target.blockNumber),
        }),
      ),
    );
    for (const logs of batches)
      assertEscrowLogContinuity(logs, contractAddress, issueId, cursor, target);
  }
}

export async function loadAndVerifyEscrowReceipt(
  rpcUrl: string,
  expectedChainId: number,
  txHash: string,
  contractAddress: string,
  expected: ExpectedEscrowEvent,
  minConfirmations = 1,
): Promise<LoadedEscrowReceipt> {
  const provider = new providers.JsonRpcProvider(rpcUrl, expectedChainId);
  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId)
    throw new EscrowVerificationError("RPC endpoint returned an unexpected chain");
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new EscrowVerificationError("Escrow transaction receipt was not found");
  const verified = verifyEscrowReceipt(receipt, contractAddress, expected, minConfirmations);
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase())
    throw new EscrowVerificationError("Escrow receipt is no longer in the canonical chain");
  if (expected.kind === "DEPOSIT") {
    const escrow = new Contract(contractAddress, [...ESCROW_ABI], provider);
    const tokenAddress: string = await escrow.token({ blockTag: receipt.blockNumber });
    if (!sameAddress(tokenAddress, expected.tokenAddress))
      throw new EscrowVerificationError("Issue token does not match the escrow's immutable token");
    const token = new Contract(
      tokenAddress,
      ["function decimals() view returns (uint8)"],
      provider,
    );
    if (Number(await token.decimals({ blockTag: receipt.blockNumber })) !== 6)
      throw new EscrowVerificationError("Escrow token must have six decimals");
  }
  return { ...verified, blockTimestamp: block.timestamp };
}

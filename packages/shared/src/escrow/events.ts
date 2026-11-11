// packages/shared/src/escrow/events.ts
// Decode log của contract thành DecodedEscrowEvent. escrowId là indexed string nên log chỉ có keccak256 của nó.
import { decodeEventLog } from "viem";
import { ESCROW_ABI } from "./abi";
import { ESCROW_RESOLUTION_KINDS, type DecodedEscrowEvent, type Hex } from "./types";

// Tăng khi đổi cách decode. ChainEvent lưu phiên bản này để replay biết log được đọc bằng bản nào (BE-41d).
export const ESCROW_DECODER_VERSION = 1;

export type RawLog = {
  address: Hex;
  topics: readonly Hex[];
  data: Hex;
};

const MAX_BPS = 10_000;

function bps(value: unknown): number {
  const n = Number(value);
  if (n > MAX_BPS) throw new Error(`clientBps out of range: ${n}`);
  return n;
}

export function decodeEscrowLog(log: RawLog, decoderVersion: number): DecodedEscrowEvent {
  if (decoderVersion !== ESCROW_DECODER_VERSION) {
    throw new Error(`unsupported decoder version ${decoderVersion}`);
  }
  const decoded = decodeEventLog({
    abi: ESCROW_ABI,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
  });
  const args = decoded.args as Record<string, unknown>;
  const hex = (key: string) => args[key] as Hex;
  const big = (key: string) => args[key] as bigint;

  switch (decoded.eventName) {
    case "Deposited":
      return {
        name: "Deposited",
        escrowIdHash: hex("escrowId"),
        client: hex("client"),
        developer: hex("developer"),
        arbiter: hex("arbiter"),
        feeRecipient: hex("feeRecipient"),
        amount: big("amount"),
        deliveryDeadline: big("deliveryDeadline"),
        termsHash: hex("termsHash"),
      };
    case "WorkSubmitted":
      return { name: "WorkSubmitted", escrowIdHash: hex("escrowId"), developer: hex("developer"), deliveryHash: hex("deliveryHash") };
    case "SettlementProposed":
      return { name: "SettlementProposed", escrowIdHash: hex("escrowId"), proposer: hex("proposer"), clientBps: bps(args.clientBps) };
    case "SettlementRevoked":
      return { name: "SettlementRevoked", escrowIdHash: hex("escrowId"), proposer: hex("proposer") };
    case "DisputeRaised":
      return {
        name: "DisputeRaised",
        escrowIdHash: hex("escrowId"),
        raisedBy: hex("raisedBy"),
        evidenceManifestHash: hex("evidenceManifestHash"),
      };
    case "CounterpartyEvidenceSubmitted":
      return {
        name: "CounterpartyEvidenceSubmitted",
        escrowIdHash: hex("escrowId"),
        submittedBy: hex("submittedBy"),
        evidenceManifestHash: hex("evidenceManifestHash"),
      };
    case "InitialRulingPosted":
      return {
        name: "InitialRulingPosted",
        escrowIdHash: hex("escrowId"),
        arbiter: hex("arbiter"),
        clientBps: bps(args.clientBps),
        decisionHash: hex("decisionHash"),
        challengeEndsAt: big("challengeEndsAt"),
      };
    case "RulingChallenged":
      return {
        name: "RulingChallenged",
        escrowIdHash: hex("escrowId"),
        challengedBy: hex("challengedBy"),
        challengedAt: big("challengedAt"),
      };
    case "FinalRulingPosted":
      return {
        name: "FinalRulingPosted",
        escrowIdHash: hex("escrowId"),
        arbiter: hex("arbiter"),
        clientBps: bps(args.clientBps),
        decisionHash: hex("decisionHash"),
        noticeEndsAt: big("noticeEndsAt"),
      };
    case "EscrowResolved": {
      const index = Number(big("kind"));
      const resolution = ESCROW_RESOLUTION_KINDS[index];
      if (resolution === undefined) throw new Error(`unknown resolution kind ${index}`);
      return {
        name: "EscrowResolved",
        escrowIdHash: hex("escrowId"),
        resolution,
        clientAmount: big("clientAmount"),
        developerAmount: big("developerAmount"),
        platformFee: big("platformFee"),
        decisionHash: hex("decisionHash"),
      };
    }
    case "Claimed":
      return { name: "Claimed", recipient: hex("recipient"), caller: hex("caller"), amount: big("amount") };
    case "ArbiterTransferProposed":
      return { name: "ArbiterTransferProposed", currentArbiter: hex("currentArbiter"), pendingArbiter: hex("pendingArbiter") };
    case "ArbiterUpdated":
      return { name: "ArbiterUpdated", oldArbiter: hex("oldArbiter"), newArbiter: hex("newArbiter") };
    case "FeeRecipientTransferProposed":
      return {
        name: "FeeRecipientTransferProposed",
        currentRecipient: hex("currentRecipient"),
        pendingRecipient: hex("pendingRecipient"),
      };
    case "FeeRecipientUpdated":
      return { name: "FeeRecipientUpdated", oldRecipient: hex("oldRecipient"), newRecipient: hex("newRecipient") };
    case "Paused":
      return { name: "Paused", account: hex("account") };
    case "Unpaused":
      return { name: "Unpaused", account: hex("account") };
    case "OwnershipTransferStarted":
      return { name: "OwnershipTransferStarted", previousOwner: hex("previousOwner"), newOwner: hex("newOwner") };
    case "OwnershipTransferred":
      return { name: "OwnershipTransferred", previousOwner: hex("previousOwner"), newOwner: hex("newOwner") };
    default:
      throw new Error("unexpected escrow event");
  }
}

// apps/web/src/test/escrow-core/events.test.ts
import { utils } from "ethers";
import { describe, expect, it } from "vitest";
import { ESCROW_ABI, ESCROW_DECODER_VERSION, decodeEscrowLog, type DecodedEscrowEvent, type Hex, type RawLog } from "@bloody-roar/shared/escrow";

// Log được mã hóa bằng ethers v5 từ ABI của contract, rồi decode bằng decodeEscrowLog (viem).
const iface = new utils.Interface([...ESCROW_ABI]);
const CONTRACT: Hex = "0x1111111111111111111111111111111111111111";
const ESCROW_ID = "issue-1";
const ESCROW_HASH = utils.id(ESCROW_ID) as Hex;
const client: Hex = "0x2222222222222222222222222222222222222222";
const developer: Hex = "0x3333333333333333333333333333333333333333";
const arbiter: Hex = "0x4444444444444444444444444444444444444444";
const feeRecipient: Hex = "0x5555555555555555555555555555555555555555";
const other: Hex = "0x6666666666666666666666666666666666666666";
const hash = (byte: string): Hex => `0x${byte.repeat(32)}`;

function logOf(name: string, values: unknown[]): RawLog {
  const { data, topics } = iface.encodeEventLog(iface.getEvent(name), values);
  return { address: CONTRACT, topics: topics as `0x${string}`[], data: data as `0x${string}` };
}

const cases: Array<[string, unknown[], DecodedEscrowEvent]> = [
  [
    "Deposited",
    [ESCROW_ID, client, developer, arbiter, feeRecipient, 1_250_000_000n, 1_791_828_000n, hash("11")],
    {
      name: "Deposited",
      escrowIdHash: ESCROW_HASH,
      client: utils.getAddress(client) as `0x${string}`,
      developer: utils.getAddress(developer) as `0x${string}`,
      arbiter: utils.getAddress(arbiter) as `0x${string}`,
      feeRecipient: utils.getAddress(feeRecipient) as `0x${string}`,
      amount: 1_250_000_000n,
      deliveryDeadline: 1_791_828_000n,
      termsHash: hash("11"),
    },
  ],
  [
    "WorkSubmitted",
    [ESCROW_ID, developer, hash("22")],
    { name: "WorkSubmitted", escrowIdHash: ESCROW_HASH, developer: utils.getAddress(developer) as `0x${string}`, deliveryHash: hash("22") },
  ],
  [
    "SettlementProposed",
    [ESCROW_ID, client, 3000],
    { name: "SettlementProposed", escrowIdHash: ESCROW_HASH, proposer: utils.getAddress(client) as `0x${string}`, clientBps: 3000 },
  ],
  [
    "SettlementRevoked",
    [ESCROW_ID, client],
    { name: "SettlementRevoked", escrowIdHash: ESCROW_HASH, proposer: utils.getAddress(client) as `0x${string}` },
  ],
  [
    "DisputeRaised",
    [ESCROW_ID, client, hash("33")],
    { name: "DisputeRaised", escrowIdHash: ESCROW_HASH, raisedBy: utils.getAddress(client) as `0x${string}`, evidenceManifestHash: hash("33") },
  ],
  [
    "CounterpartyEvidenceSubmitted",
    [ESCROW_ID, developer, hash("44")],
    {
      name: "CounterpartyEvidenceSubmitted",
      escrowIdHash: ESCROW_HASH,
      submittedBy: utils.getAddress(developer) as `0x${string}`,
      evidenceManifestHash: hash("44"),
    },
  ],
  [
    "InitialRulingPosted",
    [ESCROW_ID, arbiter, 5000, hash("55"), 1_792_432_800n],
    {
      name: "InitialRulingPosted",
      escrowIdHash: ESCROW_HASH,
      arbiter: utils.getAddress(arbiter) as `0x${string}`,
      clientBps: 5000,
      decisionHash: hash("55"),
      challengeEndsAt: 1_792_432_800n,
    },
  ],
  [
    "RulingChallenged",
    [ESCROW_ID, developer, 1_792_000_000n],
    {
      name: "RulingChallenged",
      escrowIdHash: ESCROW_HASH,
      challengedBy: utils.getAddress(developer) as `0x${string}`,
      challengedAt: 1_792_000_000n,
    },
  ],
  [
    "FinalRulingPosted",
    [ESCROW_ID, arbiter, 0, hash("66"), 1_792_100_000n],
    {
      name: "FinalRulingPosted",
      escrowIdHash: ESCROW_HASH,
      arbiter: utils.getAddress(arbiter) as `0x${string}`,
      clientBps: 0,
      decisionHash: hash("66"),
      noticeEndsAt: 1_792_100_000n,
    },
  ],
  [
    "EscrowResolved",
    [ESCROW_ID, 5, 0n, 1_000_000_000n, 0n, hash("00")],
    {
      name: "EscrowResolved",
      escrowIdHash: ESCROW_HASH,
      resolution: "RULING",
      clientAmount: 0n,
      developerAmount: 1_000_000_000n,
      platformFee: 0n,
      decisionHash: hash("00"),
    },
  ],
  [
    "Claimed",
    [client, other, 42n],
    { name: "Claimed", recipient: utils.getAddress(client) as `0x${string}`, caller: utils.getAddress(other) as `0x${string}`, amount: 42n },
  ],
  [
    "ArbiterTransferProposed",
    [arbiter, other],
    { name: "ArbiterTransferProposed", currentArbiter: utils.getAddress(arbiter) as `0x${string}`, pendingArbiter: utils.getAddress(other) as `0x${string}` },
  ],
  [
    "ArbiterUpdated",
    [arbiter, other],
    { name: "ArbiterUpdated", oldArbiter: utils.getAddress(arbiter) as `0x${string}`, newArbiter: utils.getAddress(other) as `0x${string}` },
  ],
  [
    "FeeRecipientTransferProposed",
    [feeRecipient, other],
    {
      name: "FeeRecipientTransferProposed",
      currentRecipient: utils.getAddress(feeRecipient) as `0x${string}`,
      pendingRecipient: utils.getAddress(other) as `0x${string}`,
    },
  ],
  [
    "FeeRecipientUpdated",
    [feeRecipient, other],
    { name: "FeeRecipientUpdated", oldRecipient: utils.getAddress(feeRecipient) as `0x${string}`, newRecipient: utils.getAddress(other) as `0x${string}` },
  ],
  ["Paused", [arbiter], { name: "Paused", account: utils.getAddress(arbiter) as `0x${string}` }],
  ["Unpaused", [arbiter], { name: "Unpaused", account: utils.getAddress(arbiter) as `0x${string}` }],
  [
    "OwnershipTransferStarted",
    [client, other],
    { name: "OwnershipTransferStarted", previousOwner: utils.getAddress(client) as `0x${string}`, newOwner: utils.getAddress(other) as `0x${string}` },
  ],
  [
    "OwnershipTransferred",
    [client, other],
    { name: "OwnershipTransferred", previousOwner: utils.getAddress(client) as `0x${string}`, newOwner: utils.getAddress(other) as `0x${string}` },
  ],
];

describe("decodeEscrowLog", () => {
  it.each(cases)("decodes %s from its log", (name, values, expected) => {
    expect(decodeEscrowLog(logOf(name, values), ESCROW_DECODER_VERSION)).toEqual(expected);
  });

  it("covers every event in the ABI", () => {
    const names = cases.map(([name]) => name).sort();
    const abiEvents = ESCROW_ABI.flatMap((item) => (item.type === "event" ? [item.name] : [])).sort();
    expect(names).toEqual(abiEvents);
  });

  it("refuses a decoder version it does not implement", () => {
    expect(() => decodeEscrowLog(logOf("Claimed", [client, other, 1n]), ESCROW_DECODER_VERSION + 1)).toThrow(
      /unsupported decoder version/,
    );
  });

  it("refuses a log whose topic is not an escrow event", () => {
    const log = { address: CONTRACT, topics: [hash("ab")] as `0x${string}`[], data: "0x" as `0x${string}` };
    expect(() => decodeEscrowLog(log, ESCROW_DECODER_VERSION)).toThrow();
  });

  it("refuses a clientBps above 10000", () => {
    expect(() => decodeEscrowLog(logOf("SettlementProposed", [ESCROW_ID, client, 10_001]), ESCROW_DECODER_VERSION)).toThrow(
      /out of range/,
    );
  });
});

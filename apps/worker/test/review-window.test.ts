import { expect, test } from "bun:test";
import { foldEscrowEvent, type EventMeta, type Hex } from "@bloody-roar/shared/escrow";
import { projectionFields } from "../src/indexer/project";

test("each submission resets both the fold timer and the stored review deadline", () => {
  const hash = (n: string) => `0x${n.repeat(32)}` as Hex;
  const address = (n: string) => `0x${n.repeat(20)}` as Hex;
  const day = 86400n, start = 1790000000n;
  const meta: EventMeta = { chainId: 31337, contractAddress: address("11"), blockNumber: 1n, blockHash: hash("11"), txHash: hash("22"), txIndex: 0, logIndex: 0, blockTimestamp: start };
  const state = foldEscrowEvent(null, { name: "Deposited", escrowIdHash: hash("33"), client: address("22"), developer: address("33"), arbiter: address("44"), feeRecipient: address("55"), amount: 1000n, deliveryDeadline: start + 30n * day, termsHash: hash("44") }, meta).state!;
  const work = { name: "WorkSubmitted" as const, escrowIdHash: state.escrowIdHash, developer: state.developer, deliveryHash: hash("55") };
  const first = foldEscrowEvent(state, work, { ...meta, blockTimestamp: start + day }).state!;
  const latest = foldEscrowEvent(first, work, { ...meta, blockTimestamp: start + 3n * day }).state!;
  expect(latest.submittedAt).toBe(start + 3n * day);
  expect(projectionFields(latest, 3n, []).reviewDeadline).toEqual(new Date(Number(start + 10n * day) * 1000));
  const resolved = { name: "EscrowResolved" as const, escrowIdHash: state.escrowIdHash, resolution: "REVIEW_TIMEOUT" as const, clientAmount: 0n, developerAmount: 1000n, platformFee: 100n, decisionHash: hash("00") };
  expect(() => foldEscrowEvent(latest, resolved, { ...meta, blockTimestamp: start + 8n * day })).toThrow("review window still open");
  expect(foldEscrowEvent(latest, resolved, { ...meta, blockTimestamp: start + 10n * day }).state?.phase).toBe("RESOLVED");
});

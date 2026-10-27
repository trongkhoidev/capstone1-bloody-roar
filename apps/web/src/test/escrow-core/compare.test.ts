// apps/web/src/test/escrow-core/compare.test.ts
import { describe, expect, it } from "vitest";
import {
  accountedBalance,
  compareProjectionWithChain,
  isSolvent,
  type EscrowState,
  type OnchainEscrowView,
  type Hex,
} from "@bloody-roar/shared/escrow";

const CLIENT: Hex = "0x2222222222222222222222222222222222222222";
const DEVELOPER: Hex = "0x3333333333333333333333333333333333333333";
const ARBITER: Hex = "0x4444444444444444444444444444444444444444";
const FEE: Hex = "0x5555555555555555555555555555555555555555";
const hash = (byte: string) => `0x${byte.repeat(32)}` as const;

const projection: EscrowState = {
  escrowIdHash: hash("ab"),
  client: CLIENT,
  developer: DEVELOPER,
  arbiter: ARBITER,
  feeRecipient: FEE,
  amount: 1_000_000_000n,
  depositedAt: 1_790_000_000n,
  deliveryDeadline: 1_791_000_000n,
  termsHash: hash("11"),
  deliveryHash: null,
  phase: "FUNDED",
  resolutionKind: "NONE",
  settlement: null,
  dispute: null,
};

// Chain nói đúng như projection. Mỗi test đổi một field.
const onchain = (): OnchainEscrowView => ({
  client: CLIENT,
  developer: DEVELOPER,
  arbiter: ARBITER,
  feeRecipient: FEE,
  amount: 1_000_000_000n,
  depositedAt: 1_790_000_000n,
  deliveryDeadline: 1_791_000_000n,
  termsHash: hash("11"),
  deliveryHash: null,
  phase: "FUNDED",
  resolutionKind: "NONE",
  settlement: null,
  dispute: null,
});

describe("compareProjectionWithChain", () => {
  it("reports nothing when the projection matches the chain", () => {
    expect(compareProjectionWithChain(projection, onchain())).toEqual([]);
  });

  it("ignores address and hash case", () => {
    const upper = { ...onchain(), client: CLIENT.toUpperCase().replace("0X", "0x") as `0x${string}`, termsHash: hash("11").toUpperCase().replace("0X", "0x") as `0x${string}` };
    expect(compareProjectionWithChain(projection, upper)).toEqual([]);
  });

  it.each([
    ["amount", { amount: 999_999_999n }],
    ["phase", { phase: "DISPUTED" as const }],
    ["developer", { developer: "0x6666666666666666666666666666666666666666" as const }],
    ["deliveryHash", { deliveryHash: hash("22") }],
    ["settlement", { settlement: { proposer: CLIENT, clientBps: 3000 } }],
    ["dispute", { dispute: { raisedBy: CLIENT, raisedAt: 1_790_100_000n, raiserEvidenceHash: hash("33"), counterpartyEvidenceHash: null, initialClientBps: null, initialRulingAt: null, initialDecisionHash: null, challengedAt: null, finalClientBps: null, finalRulingAt: null, finalDecisionHash: null } }],
  ])("names %s when only that field differs", (field, change) => {
    const diffs = compareProjectionWithChain(projection, { ...onchain(), ...change });
    expect(diffs.map((diff) => diff.field)).toEqual([field]);
    expect(diffs[0]?.projection).not.toBe(diffs[0]?.onchain);
  });

  it("reports every differing field, in one pass", () => {
    const diffs = compareProjectionWithChain(projection, { ...onchain(), amount: 1n, resolutionKind: "RELEASE" });
    expect(diffs.map((diff) => diff.field)).toEqual(["amount", "resolutionKind"]);
  });
});

describe("accountedBalance and isSolvent", () => {
  const resolved: EscrowState = { ...projection, escrowIdHash: hash("cd"), phase: "RESOLVED", resolutionKind: "RELEASE", amount: 500_000_000n };

  it("counts unresolved principal plus unclaimed credits, and drops resolved escrows", () => {
    // Principal chưa resolve: 1000. Claimable: 300 + 200. Escrow đã resolve (500) không cộng vào principal.
    const accounted = accountedBalance([projection, resolved], [
      { recipient: DEVELOPER, amount: 300_000_000n },
      { recipient: FEE, amount: 200_000_000n },
    ]);
    expect(accounted).toBe(1_500_000_000n);
  });

  it("is zero with no escrows and no credits", () => {
    expect(accountedBalance([], [])).toBe(0n);
  });

  it("is solvent when the contract holds at least the accounted amount", () => {
    expect(isSolvent(1_000_000_000n, 1_000_000_000n)).toBe(true);
    expect(isSolvent(1_000_000_001n, 1_000_000_000n)).toBe(true);
    expect(isSolvent(999_999_999n, 1_000_000_000n)).toBe(false);
  });
});

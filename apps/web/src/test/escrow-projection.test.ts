import { BigNumber } from "ethers";
import { describe, expect, it } from "vitest";
import { projectEscrowReceipt, isNewerEscrowReceipt } from "../lib/escrow/projection";
import type { LoadedEscrowReceipt } from "../lib/escrow/chain";

const base = {
  blockNumber: 12,
  transactionIndex: 2,
  logIndex: 0,
  blockHash: "0xblock",
  confirmations: 3,
  from: "0xcaller",
  gasPrice: BigNumber.from(1),
  gasUsed: BigNumber.from(1),
  blockTimestamp: 1700000000,
};

describe("escrow event projection", () => {
  it("uses chain time and delivery deadline instead of a 30-day server clock", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "DEPOSITED",
      event: {
        arbiterAddress: "0xarbiter",
        feeRecipientAddress: "0xfee",
        deliveryDeadline: 1700086400,
        termsHash: "0xterms",
      },
    };
    expect(projectEscrowReceipt(receipt, 6)).toMatchObject({
      escrow: {
        phase: "FUNDED",
        depositedAt: new Date(1700000000000),
        deliveryDeadline: new Date(1700086400000),
        reviewDeadline: new Date(1700691200000),
        arbiterAddress: "0xarbiter",
      },
    });
  });

  it("records allocation without recording a withdrawal", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "RESOLVED",
      event: {
        resolutionKind: "RELEASE",
        clientAmount: BigNumber.from(0),
        developerAmount: BigNumber.from(975001),
        platformFee: BigNumber.from(25000),
        decisionHash: "0xzero",
      },
    };
    const result = projectEscrowReceipt(receipt, 6);
    expect(result).toMatchObject({
      escrow: {
        phase: "RESOLVED",
        resolutionKind: "RELEASE",
        developerPayout: "0.975001",
        platformFeeAmount: "0.025",
        clientRefund: "0.0",
        resolvedAt: new Date(1700000000000),
        settlementProposer: null,
      },
      issueStatus: "COMPLETED",
    });
    expect(result.escrow).not.toHaveProperty("releasedAt");
  });

  it("projects full refunds and split payouts from actual allocations", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "RESOLVED",
      event: {
        resolutionKind: "SETTLEMENT",
        clientAmount: BigNumber.from(1000000),
        developerAmount: BigNumber.from(0),
        platformFee: BigNumber.from(0),
        decisionHash: "0xzero",
      },
    };
    expect(projectEscrowReceipt(receipt, 6)).toMatchObject({
      escrow: { status: "CANCELLED" },
      issueStatus: "CANCELLED",
    });
  });

  it("takes the ruling challenge deadline from the contract", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "INITIAL_RULING",
      event: { clientBps: 3333, decisionHash: "0xdecision", deadline: 1700604800 },
    };
    expect(projectEscrowReceipt(receipt, 6)).toMatchObject({
      escrow: { phase: "INITIAL_RULING" },
      dispute: {
        status: "PROPOSED",
        proposedClientRatio: 33.33,
        challengeDeadline: new Date(1700604800000),
        initialDecisionHash: "0xdecision",
      },
    });
  });

  it("records the accepted initial ruling ratio when no challenge was made", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "RESOLVED",
      event: {
        resolutionKind: "RULING",
        clientAmount: BigNumber.from(333300),
        developerAmount: BigNumber.from(650033),
        platformFee: BigNumber.from(16667),
        decisionHash: "0xdecision",
      },
    };
    expect(
      projectEscrowReceipt(receipt, 6, {
        proposedClientRatio: 33.33,
        finalClientRatio: null,
        settlementClientBps: null,
      }),
    ).toMatchObject({ dispute: { finalClientRatio: 33.33 } });
    expect(
      projectEscrowReceipt(receipt, 6, {
        proposedClientRatio: 33.33,
        finalClientRatio: 0,
        settlementClientBps: null,
      }),
    ).toMatchObject({ dispute: { finalClientRatio: 0 } });
  });

  it("records the arbiter timeout split without deriving a ratio from rounded payouts", () => {
    const receipt: LoadedEscrowReceipt = {
      ...base,
      outcome: "RESOLVED",
      event: {
        resolutionKind: "ARBITER_TIMEOUT_SPLIT",
        clientAmount: BigNumber.from(500000),
        developerAmount: BigNumber.from(487501),
        platformFee: BigNumber.from(12500),
        decisionHash: "0xzero",
      },
    };
    expect(projectEscrowReceipt(receipt, 6)).toMatchObject({ dispute: { finalClientRatio: 50 } });
  });

  it("cannot regress a projection with an older block or transaction in the same block", () => {
    const cursor = { lastChainBlock: 12, lastChainTransactionIndex: 2 };
    expect(isNewerEscrowReceipt({ blockNumber: 11, transactionIndex: 3 }, cursor)).toBe(false);
    expect(isNewerEscrowReceipt({ blockNumber: 12, transactionIndex: 1 }, cursor)).toBe(false);
    expect(isNewerEscrowReceipt({ blockNumber: 12, transactionIndex: 2 }, cursor)).toBe(false);
    expect(isNewerEscrowReceipt({ blockNumber: 12, transactionIndex: 3 }, cursor)).toBe(true);
  });
});

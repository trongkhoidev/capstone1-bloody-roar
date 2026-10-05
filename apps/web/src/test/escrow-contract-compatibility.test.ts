import { BigNumber, utils, type providers } from "ethers";
import { describe, expect, it } from "vitest";
import { verifyEscrowReceipt } from "../lib/escrow/chain";
import { calculatePayout } from "../lib/escrow/amounts";

// Wire fixtures use the pulled contract's signatures independently of the backend ABI.
const wire = new utils.Interface([
  "event Deposited(string indexed escrowId,address indexed client,address indexed developer,address arbiter,address feeRecipient,uint256 amount,uint256 deliveryDeadline,bytes32 termsHash)",
  "event EscrowResolved(string indexed escrowId,uint8 indexed kind,uint256 clientAmount,uint256 developerAmount,uint256 platformFee,bytes32 decisionHash)",
  "event DisputeRaised(string indexed escrowId,address indexed raisedBy,bytes32 evidenceManifestHash)",
  "event WorkSubmitted(string indexed escrowId,address indexed developer,bytes32 deliveryHash)",
  "event InitialRulingPosted(string indexed escrowId,address indexed arbiter,uint256 clientBps,bytes32 decisionHash,uint256 challengeEndsAt)",
]);
const contract = "0x1111111111111111111111111111111111111111";
const client = "0x2222222222222222222222222222222222222222";
const developer = "0x3333333333333333333333333333333333333333";
const arbiter = "0x4444444444444444444444444444444444444444";
const feeRecipient = "0x5555555555555555555555555555555555555555";
const token = "0x6666666666666666666666666666666666666666";
const zero = utils.hexZeroPad("0x00", 32);
const terms = utils.id("agreed terms");
const issueId = "issue-new-contract";

function receipt(
  event: string,
  values: unknown[],
  from = client,
  to = contract,
): providers.TransactionReceipt {
  const log = wire.encodeEventLog(wire.getEvent(event), values);
  return {
    to,
    from,
    contractAddress: "",
    transactionIndex: 2,
    gasUsed: BigNumber.from(21000),
    effectiveGasPrice: BigNumber.from(1),
    logsBloom: `0x${"00".repeat(256)}`,
    blockHash: utils.id("block"),
    transactionHash: utils.id("tx"),
    blockNumber: 10,
    confirmations: 3,
    cumulativeGasUsed: BigNumber.from(21000),
    byzantium: true,
    type: 2,
    status: 1,
    logs: [
      {
        ...log,
        address: contract,
        blockNumber: 10,
        blockHash: utils.id("block"),
        transactionHash: utils.id("tx"),
        transactionIndex: 2,
        logIndex: 1,
        removed: false,
      },
    ],
  };
}

describe("pulled escrow contract compatibility", () => {
  it("verifies the new deposit layout and retains the on-chain terms and deadline", () => {
    const result = verifyEscrowReceipt(
      receipt("Deposited", [
        issueId,
        client,
        developer,
        arbiter,
        feeRecipient,
        1000001,
        1700100000,
        terms,
      ]),
      contract,
      {
        kind: "DEPOSIT",
        issueId,
        actorAddress: client,
        clientAddress: client,
        developerAddress: developer,
        tokenAddress: token,
        amount: BigNumber.from(1000001),
      },
      3,
    );
    expect(result.outcome).toBe("DEPOSITED");
    expect(result.event).toMatchObject({
      arbiterAddress: arbiter,
      feeRecipientAddress: feeRecipient,
      deliveryDeadline: 1700100000,
      termsHash: terms,
    });
  });

  it("accepts a release allocation without claiming that tokens were transferred", () => {
    const result = verifyEscrowReceipt(
      receipt("EscrowResolved", [issueId, 1, 0, 975001, 25000, zero]),
      contract,
      {
        kind: "RELEASE",
        issueId,
        actorAddress: client,
        developerAddress: developer,
        amount: BigNumber.from(975001),
      },
    );
    expect(result.outcome).toBe("RESOLVED");
    expect(result.event).toMatchObject({ resolutionKind: "RELEASE" });
  });

  it("rejects a different escrow and a different allocation", () => {
    const expected = {
      kind: "RELEASE" as const,
      issueId,
      actorAddress: client,
      developerAddress: developer,
      amount: BigNumber.from(975001),
    };
    expect(() =>
      verifyEscrowReceipt(
        receipt("EscrowResolved", ["other", 1, 0, 975001, 25000, zero]),
        contract,
        expected,
      ),
    ).toThrow();
    expect(() =>
      verifyEscrowReceipt(
        receipt("EscrowResolved", [issueId, 1, 0, 975000, 25000, zero]),
        contract,
        expected,
      ),
    ).toThrow();
  });

  it("binds a dispute to the evidence manifest hash", () => {
    const evidenceManifestHash = utils.id("evidence manifest");
    const expected = {
      kind: "DISPUTE" as const,
      issueId,
      actorAddress: developer,
      evidenceManifestHash,
    };
    expect(
      verifyEscrowReceipt(
        receipt("DisputeRaised", [issueId, developer, evidenceManifestHash], developer),
        contract,
        expected,
      ).outcome,
    ).toBe("DISPUTED");
    expect(() =>
      verifyEscrowReceipt(
        receipt("DisputeRaised", [issueId, developer, utils.id("other")], developer),
        contract,
        expected,
      ),
    ).toThrow();
  });

  it("verifies developer work submission", () => {
    const deliveryHash = utils.id("work");
    expect(
      verifyEscrowReceipt(
        receipt("WorkSubmitted", [issueId, developer, deliveryHash], developer),
        contract,
        { kind: "WORK", issueId, actorAddress: developer, deliveryHash },
      ).outcome,
    ).toBe("WORK_SUBMITTED");
  });

  it("accepts a Safe ruling using the escrow's snapshotted arbiter", () => {
    const decisionHash = utils.id("decision");
    const result = verifyEscrowReceipt(
      receipt(
        "InitialRulingPosted",
        [issueId, arbiter, 5000, decisionHash, 1700604800],
        client,
        arbiter,
      ),
      contract,
      {
        kind: "INITIAL_RULING",
        issueId,
        actorAddress: client,
        arbiterAddress: arbiter,
        clientBps: 5000,
        decisionHash,
      },
    );
    expect(result.outcome).toBe("INITIAL_RULING");
  });

  it("uses the contract's fee rounding for a single smallest unit", () => {
    expect(calculatePayout(BigNumber.from(1), 250).toString()).toBe("1");
    expect(calculatePayout(BigNumber.from(1000001), 250).toString()).toBe("975001");
  });
});

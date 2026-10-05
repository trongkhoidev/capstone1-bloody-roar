import { BigNumber, utils, type providers } from "ethers";
import { describe, expect, it } from "vitest";
import { ESCROW_ABI, verifyEscrowReceipt, type ExpectedEscrowEvent } from "../lib/escrow/chain";

const contractAddress = "0x1111111111111111111111111111111111111111";
const clientAddress = "0x2222222222222222222222222222222222222222";
const developerAddress = "0x3333333333333333333333333333333333333333";
const tokenAddress = "0x4444444444444444444444444444444444444444";
const txHash = `0x${"ab".repeat(32)}`;
const issueId = "issue_escrow_1";
const arbiterAddress = "0x5555555555555555555555555555555555555555";
const feeRecipient = "0x6666666666666666666666666666666666666666";
const termsHash = utils.id("terms");
const depositValues = [
  issueId,
  clientAddress,
  developerAddress,
  arbiterAddress,
  feeRecipient,
  1_500_000,
  1700100000,
  termsHash,
] as const;
const iface = new utils.Interface(ESCROW_ABI);

function receiptFor(
  eventName: string,
  values: readonly unknown[],
  overrides: Partial<providers.TransactionReceipt> = {},
): providers.TransactionReceipt {
  const event = iface.getEvent(eventName);
  const encoded = iface.encodeEventLog(event, [...values]);
  return {
    to: contractAddress,
    from: clientAddress,
    contractAddress: "",
    transactionIndex: 0,
    gasUsed: BigNumber.from(21_000),
    logsBloom: `0x${"00".repeat(256)}`,
    blockHash: `0x${"cd".repeat(32)}`,
    transactionHash: txHash,
    logs: [
      {
        blockNumber: 123,
        blockHash: `0x${"cd".repeat(32)}`,
        transactionIndex: 0,
        removed: false,
        address: contractAddress,
        data: encoded.data,
        topics: encoded.topics,
        transactionHash: txHash,
        logIndex: 0,
      },
    ],
    blockNumber: 123,
    confirmations: 2,
    cumulativeGasUsed: BigNumber.from(21_000),
    effectiveGasPrice: BigNumber.from(1_000_000_000),
    byzantium: true,
    type: 2,
    status: 1,
    ...overrides,
  };
}

function depositedExpectation(): ExpectedEscrowEvent {
  return {
    kind: "DEPOSIT",
    issueId,
    actorAddress: clientAddress,
    clientAddress,
    developerAddress,
    tokenAddress,
    amount: BigNumber.from(1_500_000),
  };
}

describe("escrow transaction receipt verification", () => {
  it("accepts a successful deposit emitted by the configured contract with exact participants and amount", () => {
    const receipt = receiptFor("Deposited", depositValues);

    const verified = verifyEscrowReceipt(receipt, contractAddress, depositedExpectation(), 2);

    expect(verified).toMatchObject({
      blockNumber: 123,
      blockHash: `0x${"cd".repeat(32)}`,
      confirmations: 2,
      from: utils.getAddress(clientAddress),
      gasPrice: BigNumber.from(1_000_000_000),
      gasUsed: BigNumber.from(21_000),
      outcome: "DEPOSITED",
    });
  });

  it("enforces a configurable confirmation depth", () => {
    const receipt = receiptFor("Deposited", depositValues, { confirmations: 2 });

    expect(() => verifyEscrowReceipt(receipt, contractAddress, depositedExpectation(), 3)).toThrow(
      "3 confirmations",
    );
  });

  it("rejects a transaction sent by a different wallet even when its event payload looks valid", () => {
    const receipt = receiptFor("Deposited", depositValues, { from: developerAddress });

    expect(() => verifyEscrowReceipt(receipt, contractAddress, depositedExpectation())).toThrow(
      "transaction sender",
    );
  });

  it("rejects an event emitted by an untrusted contract", () => {
    const receipt = receiptFor("Deposited", depositValues);
    const firstLog = receipt.logs[0];
    if (!firstLog) throw new Error("Test fixture is missing its event log");
    receipt.logs[0] = { ...firstLog, address: tokenAddress };

    expect(() => verifyEscrowReceipt(receipt, contractAddress, depositedExpectation())).toThrow(
      "expected escrow event",
    );
  });

  it("rejects a receipt whose indexed issue id belongs to another escrow", () => {
    const receipt = receiptFor("Deposited", ["another_issue", ...depositValues.slice(1)]);

    expect(() => verifyEscrowReceipt(receipt, contractAddress, depositedExpectation())).toThrow(
      "expected escrow event",
    );
  });

  it("rejects reverted and unconfirmed transactions", () => {
    const eventValues = depositValues;

    expect(() =>
      verifyEscrowReceipt(
        receiptFor("Deposited", eventValues, { status: 0 }),
        contractAddress,
        depositedExpectation(),
      ),
    ).toThrow("reverted");
    expect(() =>
      verifyEscrowReceipt(
        receiptFor("Deposited", eventValues, { confirmations: 0 }),
        contractAddress,
        depositedExpectation(),
      ),
    ).toThrow("not confirmed");
  });

  it("accepts a finalized full settlement refund", () => {
    const result = verifyEscrowReceipt(
      receiptFor("EscrowResolved", [issueId, 4, 1_500_000, 0, 0, utils.hexZeroPad("0x00", 32)]),
      contractAddress,
      {
        kind: "CANCEL",
        issueId,
        actorAddress: clientAddress,
        clientAddress,
        refundAmount: BigNumber.from(1_500_000),
      },
    );
    expect(result.outcome).toBe("RESOLVED");
  });

  it("requires the on-chain evidence hash and raiser to match the request", () => {
    const evidenceManifestHash = utils.id("evidence");
    const receipt = receiptFor("DisputeRaised", [issueId, developerAddress, evidenceManifestHash], {
      from: developerAddress,
    });
    const expected = {
      kind: "DISPUTE" as const,
      issueId,
      actorAddress: developerAddress,
      evidenceManifestHash,
    };
    expect(verifyEscrowReceipt(receipt, contractAddress, expected).outcome).toBe("DISPUTED");
    expect(() =>
      verifyEscrowReceipt(receipt, contractAddress, {
        ...expected,
        evidenceManifestHash: utils.id("other"),
      }),
    ).toThrow("expected escrow event");
  });
});

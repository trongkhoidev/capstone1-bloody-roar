import { describe, expect, it } from "vitest";
import { utils, type providers } from "ethers";
import { assertEscrowLogContinuity } from "../lib/escrow/chain";

const emitter = "0x1111111111111111111111111111111111111111";
const issue = "ordered-escrow";
const wire = new utils.Interface([
  "event DisputeRaised(string indexed escrowId,address indexed raisedBy,bytes32 evidenceManifestHash)",
]);
const log = {
  ...wire.encodeEventLog(wire.getEvent("DisputeRaised"), [issue, emitter, utils.id("evidence")]),
  address: emitter,
  blockNumber: 11,
  transactionIndex: 2,
  logIndex: 4,
  removed: false,
} as providers.Log;
const cursor = { lastChainBlock: 10, lastChainTransactionIndex: 1, lastChainLogIndex: 0 };

describe("escrow event continuity", () => {
  it("rejects a newer settlement when the preceding dispute has not been confirmed", () => {
    expect(() =>
      assertEscrowLogContinuity([log], emitter, issue, cursor, {
        blockNumber: 12,
        transactionIndex: 0,
        logIndex: 0,
      }),
    ).toThrow("preceding escrow event");
  });
  it("allows the dispute itself and ignores events already represented by the cursor", () => {
    expect(() => assertEscrowLogContinuity([log], emitter, issue, cursor, log)).not.toThrow();
    expect(() =>
      assertEscrowLogContinuity(
        [log],
        emitter,
        issue,
        { lastChainBlock: 11, lastChainTransactionIndex: 2, lastChainLogIndex: 4 },
        { blockNumber: 12, transactionIndex: 0, logIndex: 0 },
      ),
    ).not.toThrow();
  });
  it("does not skip an earlier event in the same Safe batch", () => {
    expect(() =>
      assertEscrowLogContinuity([log], emitter, issue, cursor, {
        blockNumber: 11,
        transactionIndex: 2,
        logIndex: 5,
      }),
    ).toThrow("preceding escrow event");
  });
});

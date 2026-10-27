// apps/web/src/test/escrow-core/calldata.test.ts
import { utils } from "ethers";
import { describe, expect, it } from "vitest";
import {
  ESCROW_ABI,
  ESCROW_METHODS,
  encodeErc20Approve,
  encodeEscrowCall,
  type EscrowMethod,
} from "@bloody-roar/shared/escrow";

// Hai bộ mã hóa độc lập (viem trong code, ethers v5 trong test) phải cho cùng byte.
const iface = new utils.Interface([...ESCROW_ABI]);

const escrowId = "issue-1";
const developer = "0x3333333333333333333333333333333333333333";
const hash = (byte: string) => `0x${byte.repeat(32)}`;

const samples: Record<EscrowMethod, Record<string, string>> = {
  deposit: { escrowId, developer, amount: "1250000000", deliveryDeadline: "1791828000", termsHash: hash("11") },
  submitWork: { escrowId, deliveryHash: hash("22") },
  releaseFunds: { escrowId },
  claimMissedDeliveryRefund: { escrowId },
  claimReviewTimeout: { escrowId },
  proposeSettlement: { escrowId, clientBps: "3000" },
  revokeSettlement: { escrowId },
  acceptSettlement: { escrowId },
  raiseDispute: { escrowId, evidenceManifestHash: hash("33") },
  submitCounterpartyEvidence: { escrowId, evidenceManifestHash: hash("44") },
  postInitialRuling: { escrowId, clientBps: "5000", decisionHash: hash("55") },
  challengeRuling: { escrowId },
  postFinalRuling: { escrowId, clientBps: "0", decisionHash: hash("66") },
  finalizeRuling: { escrowId },
  finalizeArbiterTimeoutSplit: { escrowId },
  claim: { recipient: developer },
};

describe("encodeEscrowCall", () => {
  it("covers the 16 participant methods, all present in the ABI", () => {
    expect(ESCROW_METHODS).toHaveLength(16);
    for (const method of ESCROW_METHODS) {
      expect(ESCROW_ABI.some((item) => item.type === "function" && item.name === method), method).toBe(true);
    }
  });

  it.each(ESCROW_METHODS)("%s encodes to the same bytes as ethers", (method) => {
    const args = samples[method];
    const values = iface.getFunction(method).inputs.map((input) => args[input.name]);
    expect(encodeEscrowCall(method, args)).toBe(iface.encodeFunctionData(method, values));
  });

  it("converts uint arguments from decimal strings and keeps other types as given", () => {
    const data = encodeEscrowCall("deposit", samples.deposit);
    const [decodedEscrowId, decodedDeveloper, amount] = iface.decodeFunctionData("deposit", data);
    expect(decodedEscrowId).toBe(escrowId);
    expect(decodedDeveloper).toBe(utils.getAddress(developer));
    expect(amount.toString()).toBe("1250000000");
  });

  it("rejects an unknown method, a missing argument, an extra argument and non-integer amounts", () => {
    expect(() => encodeEscrowCall("nope" as EscrowMethod, {})).toThrow(/unknown escrow method/);
    expect(() => encodeEscrowCall("releaseFunds", {})).toThrow(/missing argument "escrowId"/);
    expect(() => encodeEscrowCall("releaseFunds", { escrowId, extra: "x" })).toThrow(/no argument "extra"/);
    for (const amount of ["1.5", "-1", "", "1e6"]) {
      expect(() => encodeEscrowCall("deposit", { ...samples.deposit, amount }), amount).toThrow(/decimal integer/);
    }
  });
});

describe("encodeErc20Approve", () => {
  it("encodes approve(address,uint256) with the standard selector", () => {
    const spender = "0x1111111111111111111111111111111111111111";
    const data = encodeErc20Approve(spender, "1250000000");
    expect(data.slice(0, 10)).toBe("0x095ea7b3");
    const approve = new utils.Interface(["function approve(address spender, uint256 amount) returns (bool)"]);
    expect(data).toBe(approve.encodeFunctionData("approve", [spender, "1250000000"]));
  });

  it("rejects a non-integer amount", () => {
    expect(() => encodeErc20Approve("0x1111111111111111111111111111111111111111", "1.5")).toThrow(/decimal integer/);
  });
});

// apps/web/src/test/escrow-core/reservation-check.test.ts
import { describe, expect, it } from "vitest";
import { checkDepositAgainstReservation, type DepositFact } from "@bloody-roar/shared/escrow";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const reservation: DepositFact = {
  client: "0x2222222222222222222222222222222222222222",
  developer: "0x3333333333333333333333333333333333333333",
  amount: 1_250_000_000n,
  deliveryDeadline: 1_791_828_000n,
  termsHash: `0x${"11".repeat(32)}`,
  token: USDC,
};

describe("checkDepositAgainstReservation", () => {
  it("returns no reasons when the deposit matches", () => {
    expect(checkDepositAgainstReservation({ ...reservation }, reservation)).toEqual([]);
  });

  it("treats address and hash case as the same value", () => {
    const deposit = { ...reservation, client: reservation.client.toUpperCase().replace("0X", "0x") as `0x${string}` };
    expect(checkDepositAgainstReservation(deposit, reservation)).toEqual([]);
  });

  it.each([
    ["client", { client: "0x6666666666666666666666666666666666666666" as const }],
    ["developer", { developer: "0x6666666666666666666666666666666666666666" as const }],
    ["amount", { amount: 1_250_000_001n }],
    ["deadline", { deliveryDeadline: 1_791_828_001n }],
    ["termsHash", { termsHash: `0x${"22".repeat(32)}` as const }],
    ["token", { token: "0x1111111111111111111111111111111111111111" as const }],
  ])("reports %s alone when only that field differs", (reason, change) => {
    expect(checkDepositAgainstReservation({ ...reservation, ...change }, reservation)).toEqual([reason]);
  });

  it("reports every mismatch in field order", () => {
    const deposit = { ...reservation, amount: 1n, token: "0x1111111111111111111111111111111111111111" as const };
    expect(checkDepositAgainstReservation(deposit, reservation)).toEqual(["amount", "token"]);
  });
});

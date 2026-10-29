import { BigNumber } from "ethers";
import { describe, expect, it } from "vitest";
import { calculatePayout, decimalAmountToRaw } from "../lib/escrow/amounts";

describe("escrow token amount conversion", () => {
  it("converts human token units without JavaScript floating-point arithmetic", () => {
    expect(decimalAmountToRaw("1234.567891", 6).toString()).toBe("1234567891");
  });

  it("rejects a bounty with more precision than the token supports", () => {
    expect(() => decimalAmountToRaw("1.0000001", 6)).toThrow("token precision");
  });

  it("calculates the developer payout using integer basis-point arithmetic", () => {
    const amount = BigNumber.from("1000001");

    expect(calculatePayout(amount, 250).toString()).toBe("975001");
  });

  it("rejects an invalid platform fee snapshot", () => {
    expect(() => calculatePayout(BigNumber.from(10), 10_001)).toThrow("basis points");
  });
});

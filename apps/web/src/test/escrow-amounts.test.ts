import { describe, expect, it } from "vitest";
import { decimalAmountToRaw } from "../lib/escrow/amounts";

describe("escrow token amount conversion", () => {
  it("converts human token units without JavaScript floating-point arithmetic", () => {
    expect(decimalAmountToRaw("1234.567891", 6).toString()).toBe("1234567891");
  });

  it("rejects a bounty with more precision than the token supports", () => {
    expect(() => decimalAmountToRaw("1.0000001", 6)).toThrow("token precision");
  });
});

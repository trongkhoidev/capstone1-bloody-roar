import { describe, expect, it } from "vitest";
import { parseTokenAmountInput, tokenAmount } from "../graphql/builder";

describe("TokenAmount helpers", () => {
  it("parses a decimal string into base units", () => {
    expect(parseTokenAmountInput("1250.00", { decimals: 6 })).toBe(1_250_000_000n);
  });

  it("rejects malformed amounts with a GraphQL error", () => {
    expect(() => parseTokenAmountInput("12.3.4", { decimals: 6 })).toThrow("Số tiền không hợp lệ");
  });

  it("builds the output shape with a formatted value", () => {
    expect(tokenAmount(1_250_000_000n, { decimals: 6, symbol: "USDC" })).toEqual({
      raw: 1_250_000_000n,
      decimals: 6,
      symbol: "USDC",
      formatted: "1250",
    });
  });
});

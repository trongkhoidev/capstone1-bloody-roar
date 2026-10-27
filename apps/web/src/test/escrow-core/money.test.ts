// apps/web/src/test/escrow-core/money.test.ts
import { describe, expect, it } from "vitest";
import { bpsOf, formatTokenAmount, parseTokenAmount, splitPayout } from "@bloody-roar/shared/money";

const UINT256_MAX = 2n ** 256n - 1n;

describe("parseTokenAmount", () => {
  it("converts decimal text to base units", () => {
    expect(parseTokenAmount("1250.00", 6)).toBe(1_250_000_000n);
    expect(parseTokenAmount("1250", 6)).toBe(1_250_000_000n);
    expect(parseTokenAmount("0.000001", 6)).toBe(1n);
    expect(parseTokenAmount("0", 6)).toBe(0n);
    expect(parseTokenAmount("42", 0)).toBe(42n);
  });

  it("accepts exactly the token's decimal places and no more", () => {
    expect(parseTokenAmount("1.123456", 6)).toBe(1_123_456n);
    expect(() => parseTokenAmount("1.1234567", 6)).toThrow(/decimal places/);
    expect(() => parseTokenAmount("1.0000000", 6)).toThrow(/decimal places/);
  });

  it("rejects negative numbers", () => {
    expect(() => parseTokenAmount("-1", 6)).toThrow(/invalid token amount/);
    expect(() => parseTokenAmount("-0.5", 6)).toThrow(/invalid token amount/);
  });

  it("rejects empty text, letters, signs, separators and scientific notation", () => {
    for (const text of ["", " 1", "1 ", "abc", "1a", "+1", "1,000", "1e3", "1.", ".5", "0x10"]) {
      expect(() => parseTokenAmount(text, 6), text).toThrow(/invalid token amount/);
    }
  });

  it("rejects values above uint256", () => {
    const max = UINT256_MAX.toString();
    expect(parseTokenAmount(max, 0)).toBe(UINT256_MAX);
    expect(() => parseTokenAmount(`${max}1`, 0)).toThrow(/exceeds uint256/);
  });

  it("rejects invalid decimals", () => {
    expect(() => parseTokenAmount("1", -1)).toThrow(/invalid decimals/);
    expect(() => parseTokenAmount("1", 1.5)).toThrow(/invalid decimals/);
  });
});

describe("formatTokenAmount", () => {
  it("keeps full precision and drops trailing zeros", () => {
    expect(formatTokenAmount(853_125_000n, 6)).toBe("853.125");
    expect(formatTokenAmount(1_250_000_000n, 6)).toBe("1250");
    expect(formatTokenAmount(1n, 6)).toBe("0.000001");
    expect(formatTokenAmount(0n, 6)).toBe("0");
    expect(formatTokenAmount(42n, 0)).toBe("42");
  });

  it("rejects negative amounts and invalid decimals", () => {
    expect(() => formatTokenAmount(-1n, 6)).toThrow(/negative token amount/);
    expect(() => formatTokenAmount(1n, -1)).toThrow(/invalid decimals/);
  });

  it("round-trips with parseTokenAmount", () => {
    for (const raw of [0n, 1n, 999_999n, 1_000_000n, 853_125_000n, 123_456_789_012n]) {
      expect(parseTokenAmount(formatTokenAmount(raw, 6), 6)).toBe(raw);
    }
  });
});

describe("bpsOf", () => {
  it("takes a basis-point share", () => {
    expect(bpsOf(1_000n, 250)).toBe(25n);
    expect(bpsOf(0n, 250)).toBe(0n);
    expect(bpsOf(1_000n, 0)).toBe(0n);
    expect(bpsOf(1_000n, 10_000)).toBe(1_000n);
  });

  it("rounds down", () => {
    expect(bpsOf(999n, 250)).toBe(24n); // 24,975 -> 24
    expect(bpsOf(1n, 9_999)).toBe(0n);
  });

  it("rejects bps outside 0..10000 and negative amounts", () => {
    expect(() => bpsOf(1n, -1)).toThrow(/invalid bps/);
    expect(() => bpsOf(1n, 10_001)).toThrow(/invalid bps/);
    expect(() => bpsOf(1n, 2.5)).toThrow(/invalid bps/);
    expect(() => bpsOf(-1n, 250)).toThrow(/negative amount/);
  });
});

describe("splitPayout", () => {
  it("releases to the developer with the fee on the developer's share", () => {
    expect(splitPayout(1_000_000_000n, 250)).toEqual({
      developer: 975_000_000n,
      fee: 25_000_000n,
      client: 0n,
    });
  });

  it("rounds the fee down and gives the remainder to the developer", () => {
    expect(splitPayout(999n, 250)).toEqual({ developer: 975n, fee: 24n, client: 0n });
  });

  it("charges no fee on the client's share (QĐ-02)", () => {
    // 1000 * 30% = 300 to the client. Developer gross 700, fee floor(700 * 2.5%) = 17.
    expect(splitPayout(1_000n, 250, 3_000)).toEqual({ developer: 683n, fee: 17n, client: 300n });
  });

  it("refunds the full principal to the client with no fee", () => {
    expect(splitPayout(1_000n, 250, 10_000)).toEqual({ developer: 0n, fee: 0n, client: 1_000n });
  });

  it("pays nothing on a zero principal", () => {
    expect(splitPayout(0n, 250, 5_000)).toEqual({ developer: 0n, fee: 0n, client: 0n });
  });

  it("conserves every unit for each client share", () => {
    for (const principal of [1n, 7n, 999n, 1_000_001n, 123_456_789n]) {
      for (const clientBps of [0, 1, 1_234, 5_000, 9_999, 10_000]) {
        const { developer, fee, client } = splitPayout(principal, 250, clientBps);
        expect(developer + fee + client, `${principal} ${clientBps}`).toBe(principal);
      }
    }
  });

  it("rejects a negative principal and out-of-range bps", () => {
    expect(() => splitPayout(-1n, 250)).toThrow(/negative amount/);
    expect(() => splitPayout(1n, 10_001)).toThrow(/invalid bps/);
    expect(() => splitPayout(1n, 250, -1)).toThrow(/invalid bps/);
  });
});

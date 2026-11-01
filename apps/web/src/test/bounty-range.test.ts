import { describe, expect, it } from "vitest";
import { BOUNTY_MIN_AMOUNT } from "@bloody-roar/shared";
import { parseTokenAmountInput } from "../graphql/builder";

describe("Bounty range validation (R7)", () => {
  it("allows 0.5 USDC as the minimum bounty amount", () => {
    expect(BOUNTY_MIN_AMOUNT).toBeLessThanOrEqual(0.5);
    const raw = parseTokenAmountInput(String(BOUNTY_MIN_AMOUNT), { decimals: 6 });
    expect(raw).toBe(500_000n);
  });
});

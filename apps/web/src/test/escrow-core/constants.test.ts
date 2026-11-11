// apps/web/src/test/escrow-core/constants.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as shared from "@bloody-roar/shared/constants";
import { ESCROW_CONSTANTS } from "@bloody-roar/shared/escrow";

const DAY = 86_400;
const HOUR = 3_600;
const UNIT_SECONDS: Record<string, number> = { days: DAY, hours: HOUR, seconds: 1 };

// Đọc hằng số từ nguồn Solidity. Giá trị kỳ hạn được đổi ra giây.
function readContractConstants(): Map<string, number> {
  const source = readFileSync(
    resolve(__dirname, "../../../../contracts/contracts/BloodyRoarEscrow.sol"),
    "utf8",
  );
  const constants = new Map<string, number>();
  for (const match of source.matchAll(/uint256 public constant (\w+) = ([\d_]+)(?: (days|hours|seconds))?;/g)) {
    const [, name, digits, unit] = match;
    if (name === undefined || digits === undefined) continue;
    constants.set(name, Number(digits.replaceAll("_", "")) * (unit ? (UNIT_SECONDS[unit] ?? 0) : 1));
  }
  return constants;
}

const onchain = readContractConstants();

describe("escrow constants match BloodyRoarEscrow.sol", () => {
  it.each([
    ["MAX_BPS", 10_000],
    ["PLATFORM_FEE_BPS", ESCROW_CONSTANTS.FEE_BPS],
    ["REVIEW_PERIOD", ESCROW_CONSTANTS.REVIEW_DAYS * DAY],
    ["EVIDENCE_RESPONSE_PERIOD", ESCROW_CONSTANTS.EVIDENCE_HOURS * HOUR],
    ["CHALLENGE_PERIOD", ESCROW_CONSTANTS.CHALLENGE_DAYS * DAY],
    ["FINAL_RULING_NOTICE_PERIOD", ESCROW_CONSTANTS.FINAL_NOTICE_HOURS * HOUR],
    ["ARBITER_STALL_PERIOD", ESCROW_CONSTANTS.ARBITER_STALL_DAYS * DAY],
  ])("%s equals the shared value", (name, expected) => {
    expect(onchain.get(name)).toBe(expected);
  });

  it("keeps the legacy shared constants in sync", () => {
    expect(shared.ESCROW_REVIEW_DAYS).toBe(ESCROW_CONSTANTS.REVIEW_DAYS);
    expect(shared.DISPUTE_EVIDENCE_RESPONSE_HOURS).toBe(ESCROW_CONSTANTS.EVIDENCE_HOURS);
    expect(shared.DISPUTE_CHALLENGE_DAYS).toBe(ESCROW_CONSTANTS.CHALLENGE_DAYS);
    expect(shared.DISPUTE_FINAL_NOTICE_HOURS).toBe(ESCROW_CONSTANTS.FINAL_NOTICE_HOURS);
    expect(shared.ARBITER_STALL_DAYS).toBe(ESCROW_CONSTANTS.ARBITER_STALL_DAYS);
    expect(shared.PLATFORM_FEE_BPS).toBe(ESCROW_CONSTANTS.FEE_BPS);
    expect(shared.PLATFORM_FEE_PERCENT * 100).toBe(ESCROW_CONSTANTS.FEE_BPS);
  });

  it("finds all seven expected constants, so the regex is not matching nothing", () => {
    for (const name of [
      "MAX_BPS",
      "PLATFORM_FEE_BPS",
      "REVIEW_PERIOD",
      "EVIDENCE_RESPONSE_PERIOD",
      "CHALLENGE_PERIOD",
      "FINAL_RULING_NOTICE_PERIOD",
      "ARBITER_STALL_PERIOD",
    ]) {
      expect(onchain.has(name), name).toBe(true);
    }
  });
});

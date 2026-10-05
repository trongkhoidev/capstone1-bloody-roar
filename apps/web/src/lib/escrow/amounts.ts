import { utils } from "ethers";
import type { BigNumber } from "ethers";

const MAX_BPS = 10_000;

export function decimalAmountToRaw(value: string, decimals: number): BigNumber {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid token precision");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error("Invalid bounty amount");
  }
  const fractionLength = value.split(".")[1]?.length ?? 0;
  if (fractionLength > decimals) {
    throw new Error("Bounty amount exceeds token precision");
  }
  return utils.parseUnits(value, decimals);
}

export function calculatePayout(amount: BigNumber, platformFeeBps: number): BigNumber {
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > MAX_BPS) {
    throw new Error("Platform fee basis points are invalid");
  }
  return amount.sub(amount.mul(platformFeeBps).div(MAX_BPS));
}

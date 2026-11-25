// packages/shared/src/money.ts
// Số tiền dạng đơn vị nhỏ nhất (bigint). Làm tròn xuống ở mọi phép chia, như Math.mulDiv của contract.

const BPS_DENOMINATOR = 10_000n;
const MAX_UINT256 = 2n ** 256n - 1n;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error(`invalid decimals: ${decimals}`);
}

function assertBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error(`invalid bps: ${bps}`);
}

// "1250.00", 6 -> 1250000000n. Chỉ nhận chữ số thập phân, không dấu, không khoảng trắng, không ký hiệu khoa học.
export function parseTokenAmount(text: string, decimals: number): bigint {
  assertDecimals(decimals);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || match[1] === undefined) throw new Error(`invalid token amount: "${text}"`);
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new Error(`too many decimal places for ${decimals}: "${text}"`);
  const raw = BigInt(match[1] + fraction.padEnd(decimals, "0"));
  if (raw > MAX_UINT256) throw new Error(`token amount exceeds uint256: "${text}"`);
  return raw;
}

// 853125000n, 6 -> "853.125". Giữ đủ độ chính xác, bỏ số 0 thừa ở phần thập phân.
export function formatTokenAmount(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (raw < 0n) throw new Error(`negative token amount: ${raw}`);
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function bpsOf(amount: bigint, bps: number): bigint {
  assertBps(bps);
  if (amount < 0n) throw new Error(`negative amount: ${amount}`);
  return (amount * BigInt(bps)) / BPS_DENOMINATOR;
}

export function depositTotal(principal: bigint, feeBps: number): bigint {
  return principal + bpsOf(principal, feeBps);
}

export function splitPayout(
  principal: bigint,
  feeBps: number,
  clientBps = 0,
): { developer: bigint; fee: bigint; client: bigint } {
  assertBps(feeBps);
  assertBps(clientBps);
  const clientShare = bpsOf(principal, clientBps);
  const developer = principal - clientShare;
  const fee = bpsOf(developer, feeBps);
  return { developer, fee, client: clientShare + bpsOf(principal, feeBps) - fee };
}

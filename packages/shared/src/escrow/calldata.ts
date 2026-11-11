// packages/shared/src/escrow/calldata.ts
// Mã hóa calldata cho 16 hàm người tham gia gọi. args là chuỗi, khớp tên tham số trong ABI.
import { encodeFunctionData, type Abi, type AbiFunction } from "viem";
import { ESCROW_ABI } from "./abi";
import type { Hex } from "./types";

// Kiểu rộng để tra cứu theo tên lúc chạy. Kiểu hẹp của ESCROW_ABI không nhận tên là biến.
const abi: Abi = ESCROW_ABI;

export const ESCROW_METHODS = [
  "deposit",
  "submitWork",
  "releaseFunds",
  "claimMissedDeliveryRefund",
  "claimReviewTimeout",
  "proposeSettlement",
  "revokeSettlement",
  "acceptSettlement",
  "raiseDispute",
  "submitCounterpartyEvidence",
  "postInitialRuling",
  "challengeRuling",
  "postFinalRuling",
  "finalizeRuling",
  "finalizeArbiterTimeoutSplit",
  "claim",
] as const;

export type EscrowMethod = (typeof ESCROW_METHODS)[number];

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Số dạng chuỗi thập phân, không dấu. Chuỗi khác thì viem sẽ hiểu sai, nên từ chối trước.
function uintArg(name: string, raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a decimal integer: "${raw}"`);
  return BigInt(raw);
}

export function encodeEscrowCall(method: EscrowMethod, args: Record<string, string>): Hex {
  const item = abi.find((entry): entry is AbiFunction => entry.type === "function" && entry.name === method);
  if (!item) throw new Error(`unknown escrow method: ${method}`);

  const names = new Set<string>(item.inputs.map((input) => input.name ?? ""));
  for (const key of Object.keys(args)) {
    if (!names.has(key)) throw new Error(`${method} has no argument "${key}"`);
  }

  const values = item.inputs.map((input) => {
    const name = input.name ?? "";
    const raw = args[name];
    if (raw === undefined) throw new Error(`${method} is missing argument "${name}"`);
    if (input.type.startsWith("uint")) return uintArg(name, raw);
    return raw;
  });
  return encodeFunctionData({ abi, functionName: method, args: values });
}

export function encodeErc20Approve(spender: Hex, amountRaw: string): Hex {
  return encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, uintArg("amount", amountRaw)],
  });
}

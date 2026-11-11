// packages/shared/src/escrow/eip712.ts
// FundingIntent (QĐ-18): client ký ở bước fund. Hạn 30 phút (intentExpiry) do người gọi kiểm, không kiểm ở đây.
import { recoverTypedDataAddress, type TypedDataDefinition } from "viem";
import type { Hex } from "./types";

export type FundingIntentInput = {
  chainId: number;
  verifyingContract: Hex;
  escrowId: string;
  client: Hex;
  developer: Hex;
  token: Hex;
  amount: bigint;
  deliveryDeadline: bigint;
  termsHash: Hex;
  intentExpiry: bigint;
  nonce: bigint;
};

export const FUNDING_INTENT_TYPES = {
  FundingIntent: [
    { name: "escrowId", type: "string" },
    { name: "client", type: "address" },
    { name: "developer", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deliveryDeadline", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "intentExpiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type FundingIntentTypedData = TypedDataDefinition<typeof FUNDING_INTENT_TYPES, "FundingIntent">;

export function fundingIntentTypedData(input: FundingIntentInput): FundingIntentTypedData {
  return {
    domain: {
      name: "BloodyRoarEscrow",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    types: FUNDING_INTENT_TYPES,
    primaryType: "FundingIntent",
    message: {
      escrowId: input.escrowId,
      client: input.client,
      developer: input.developer,
      token: input.token,
      amount: input.amount,
      deliveryDeadline: input.deliveryDeadline,
      termsHash: input.termsHash,
      intentExpiry: input.intentExpiry,
      nonce: input.nonce,
    },
  };
}

// async vì viem không có API đồng bộ để recover chữ ký. README 6.1 ghi đồng bộ; đây là lệch đã báo cáo.
export async function recoverFundingIntentSigner(input: FundingIntentInput, signature: Hex): Promise<Hex> {
  return recoverTypedDataAddress({ ...fundingIntentTypedData(input), signature });
}

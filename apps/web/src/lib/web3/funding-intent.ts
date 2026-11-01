import { fundingIntentTypedData, type Hex } from "@bloody-roar/shared/escrow";
import type { TypedDataDomain } from "ethers";
import { walletSigner } from "./send-prepared";

export type FundingReservation = {
  chainId: number;
  contractAddress: string;
  tokenAddress: string;
  escrowKey: string;
  termsHash: string;
  amountRaw: string;
  deliveryDeadline: string;
};

// Signs the EIP-712 funding intent for a reservation. Same typed data the local harness signs.
export async function signFundingIntent(reservation: FundingReservation, client: string, developer: string) {
  const signer = await walletSigner(client);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = BigInt(`0x${Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
  const expiry = new Date(Date.now() + 10 * 60_000);
  const typed = fundingIntentTypedData({
    chainId: reservation.chainId,
    verifyingContract: reservation.contractAddress as Hex,
    escrowId: reservation.escrowKey,
    client: client as Hex,
    developer: developer as Hex,
    token: reservation.tokenAddress as Hex,
    amount: BigInt(reservation.amountRaw),
    deliveryDeadline: BigInt(Math.floor(new Date(reservation.deliveryDeadline).getTime() / 1000)),
    termsHash: reservation.termsHash as Hex,
    intentExpiry: BigInt(Math.floor(expiry.getTime() / 1000)),
    nonce,
  });

  // ethers adds EIP712Domain itself, so types holds only FundingIntent; bigints go as decimal strings.
  const message = Object.fromEntries(Object.entries(typed.message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]));
  const signature = await signer._signTypedData(typed.domain as TypedDataDomain, { FundingIntent: [...typed.types.FundingIntent] }, message);
  return { signature, nonce: nonce.toString(), intentExpiry: expiry.toISOString() };
}

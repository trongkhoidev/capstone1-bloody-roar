import { fundingIntentTypedData, type Hex } from "@bloody-roar/shared/escrow";
import { ensureActiveChain } from "./client";

type Ethereum = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

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
  await ensureActiveChain();
  const ethereum = (globalThis as unknown as { ethereum?: Ethereum }).ethereum;
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  const [from] = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];

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

  // Wallets expect the EIP712Domain type in the payload; bigints travel as decimal strings.
  const payload = JSON.stringify(
    { ...typed, types: { EIP712Domain: [
      { name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
    ], ...typed.types } },
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
  );
  const signature = (await ethereum.request({ method: "eth_signTypedData_v4", params: [from, payload] })) as string;
  return { signature, nonce: nonce.toString(), intentExpiry: expiry.toISOString() };
}

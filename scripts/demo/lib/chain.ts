import { fundingIntentTypedData, type Hex } from "../../../packages/shared/src/escrow";
import { ethers, type BigNumber, type Contract, type providers, type Wallet } from "./ethers";
import { gqlRequest } from "./gql";
import { appendLedger } from "./ledger";
import { assertBaseSepolia } from "../fund";
import type { UserSession } from "./session";

export interface PreparedCall {
  intentId: string;
  contractAddress: string;
  data: string;
  value: string;
}

export interface FundingReservationData {
  id: string;
  chainId: number;
  contractAddress: string;
  tokenAddress: string;
  escrowKey: string;
  termsHash: string;
  amountRaw: string;
  deliveryDeadline: string;
}

export async function executePreparedCalls(
  wallet: Wallet,
  calls: PreparedCall[],
  session: UserSession,
  purpose: string,
  baseUrl = "http://localhost:4100"
): Promise<string[]> {
  const provider = wallet.provider;
  if (provider) {
    await assertBaseSepolia(provider);
  }

  const hashes: string[] = [];
  for (const call of calls) {
    const tx = await wallet.sendTransaction({
      to: call.contractAddress,
      data: call.data,
      value: ethers.BigNumber.from(call.value),
    });

    // Record submission to server
    await gqlRequest(
      `mutation RecordTx($intentId: String!, $txHash: String!) {
        recordTransactionSubmitted(intentId: $intentId, txHash: $txHash) {
          success
        }
      }`,
      { intentId: call.intentId, txHash: tx.hash },
      { cookie: session.cookie, ip: session.ip, baseUrl }
    ).catch((err) => {
      console.warn(`Failed to record tx submission for ${call.intentId}:`, err);
    });

    const receipt = await tx.wait(1);
    if (receipt.status !== 1) {
      throw new Error(`Transaction failed on chain: ${tx.hash}`);
    }

    appendLedger({
      ts: new Date().toISOString(),
      from: wallet.address,
      to: call.contractAddress,
      asset: "ETH",
      amount: ethers.utils.formatEther(call.value),
      txHash: tx.hash,
      purpose: `${purpose} (intent: ${call.intentId})`,
    });

    hashes.push(tx.hash);
  }

  return hashes;
}

export async function signAndSubmitFunding(
  wallet: Wallet,
  reservation: FundingReservationData,
  developerAddress: string,
  session: UserSession,
  baseUrl = "http://localhost:4100"
): Promise<PreparedCall[]> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = BigInt(`0x${Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
  const expiry = new Date(Date.now() + 15 * 60_000);

  const typed = fundingIntentTypedData({
    chainId: reservation.chainId,
    verifyingContract: reservation.contractAddress as Hex,
    escrowId: reservation.escrowKey,
    client: wallet.address as Hex,
    developer: developerAddress as Hex,
    token: reservation.tokenAddress as Hex,
    amount: BigInt(reservation.amountRaw),
    deliveryDeadline: BigInt(Math.floor(new Date(reservation.deliveryDeadline).getTime() / 1000)),
    termsHash: reservation.termsHash as Hex,
    intentExpiry: BigInt(Math.floor(expiry.getTime() / 1000)),
    nonce,
  });

  const message = Object.fromEntries(
    Object.entries(typed.message).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ])
  );

  const signature = await (wallet as unknown as {
    _signTypedData: (
      domain: unknown,
      types: Record<string, unknown>,
      value: Record<string, unknown>
    ) => Promise<string>;
  })._signTypedData(typed.domain, { FundingIntent: [...typed.types.FundingIntent] }, message);

  const res = await gqlRequest<{ submitFundingIntent: { calls: PreparedCall[] } }>(
    `mutation SubmitIntent($input: SubmitFundingIntentInput!) {
      submitFundingIntent(input: $input) {
        calls {
          intentId
          contractAddress
          data
          value
        }
      }
    }`,
    {
      input: {
        reservationId: reservation.id,
        signature,
        nonce: nonce.toString(),
        intentExpiry: expiry.toISOString(),
      },
    },
    { cookie: session.cookie, ip: session.ip, baseUrl }
  );

  return res.submitFundingIntent.calls;
}

import { ethers } from "ethers";
import { ACTIVE_CHAIN, ensureActiveChain, getWalletKind } from "./client";

// One call the server prepared for the wallet to sign and send.
export type PreparedCall = { intentId: string; contractAddress: string; data: string; value: string };

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export async function walletSigner(expected: string): Promise<ethers.Signer & Pick<ethers.Wallet, "_signTypedData">> {
  if (getWalletKind() === "in-app") {
    const { restoreInAppAccount, inAppEthersSigner } = await import("./in-app");
    const account = await restoreInAppAccount();
    if (!account) throw new Error("Your Google wallet session expired. Sign out and sign in with Google again.");
    if (account.address.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`Your Google wallet has ${short(account.address)} selected, not the signed-in account ${short(expected)}. Sign out and sign in with the correct Google account.`);
    }
    return inAppEthersSigner(account);
  }

  await ensureActiveChain();
  const ethereum = (globalThis as unknown as { ethereum?: ethers.providers.ExternalProvider }).ethereum;
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");
  const provider = new ethers.providers.Web3Provider(ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const actual = await signer.getAddress();
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Your wallet has ${short(actual)} selected, not the signed-in account ${short(expected)}. Switch accounts in the wallet and try again.`);
  }
  return signer;
}

// Sends the prepared calls one after another; each is recorded against its intent before its receipt is awaited.
export async function sendPreparedCalls(calls: PreparedCall[], record: (intentId: string, txHash: string) => Promise<void>, expected: string): Promise<string[]> {
  const signer = await walletSigner(expected);
  const hashes: string[] = [];
  for (const call of calls) {
    const tx = await signer.sendTransaction({ to: call.contractAddress, data: call.data, value: ethers.BigNumber.from(call.value) }).catch((error: unknown) => {
      const failure = error as { code?: string; message?: string; data?: { message?: string } } | null;
      if (failure?.code === "INSUFFICIENT_FUNDS" || /insufficient funds|insufficient (?:native|gas) balance|sender doesn't have enough funds/i.test(
        `${failure?.message ?? error} ${failure?.data?.message ?? ""}`,
      )) {
        throw new Error(`Your wallet needs ${ACTIVE_CHAIN.name} ETH for gas. Address: ${expected}`);
      }
      throw error;
    });
    await record(call.intentId, tx.hash);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw new Error("The transaction failed on-chain.");
    hashes.push(tx.hash);
  }
  return hashes;
}

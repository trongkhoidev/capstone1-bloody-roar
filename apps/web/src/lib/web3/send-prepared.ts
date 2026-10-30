import { ethers } from "ethers";
import { ensureActiveChain } from "./client";

// One call the server prepared for the wallet to sign and send.
export type PreparedCall = { intentId: string; contractAddress: string; data: string; value: string };

// Signer for the injected wallet, connected and on the active chain.
export async function walletSigner(): Promise<ethers.providers.JsonRpcSigner> {
  await ensureActiveChain();
  const ethereum = (globalThis as unknown as { ethereum?: ethers.providers.ExternalProvider }).ethereum;
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  const provider = new ethers.providers.Web3Provider(ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

// Sends the prepared calls one after another; each is recorded against its intent before its receipt is awaited.
export async function sendPreparedCalls(calls: PreparedCall[], record: (intentId: string, txHash: string) => Promise<void>): Promise<string[]> {
  const signer = await walletSigner();
  const hashes: string[] = [];
  for (const call of calls) {
    const tx = await signer.sendTransaction({ to: call.contractAddress, data: call.data, value: ethers.BigNumber.from(call.value) });
    await record(call.intentId, tx.hash);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw new Error("Giao dịch không thành công trên chain.");
    hashes.push(tx.hash);
  }
  return hashes;
}

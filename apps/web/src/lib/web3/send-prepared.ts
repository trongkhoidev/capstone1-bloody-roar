import { ensureActiveChain } from "./client";

// One call the server prepared for the wallet to sign and send.
export type PreparedCall = { intentId: string; contractAddress: string; data: string; value: string };
type Ethereum = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits for a receipt, failing when the transaction reverts or never lands.
async function waitForReceipt(ethereum: Ethereum, hash: string): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = (await ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status: string } | null;
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("Giao dịch không thành công trên chain.");
      return;
    }
    await sleep(2000);
  }
  throw new Error("Chờ giao dịch quá lâu. Kiểm tra lại sau.");
}

// Sends the prepared calls one after another; each is recorded against its intent before its receipt is awaited.
export async function sendPreparedCalls(calls: PreparedCall[], record: (intentId: string, txHash: string) => Promise<void>): Promise<string[]> {
  await ensureActiveChain();
  const ethereum = (globalThis as unknown as { ethereum?: Ethereum }).ethereum;
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  const [from] = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  if (!from) throw new Error("Chưa có tài khoản ví.");

  const hashes: string[] = [];
  for (const call of calls) {
    const hash = (await ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from, to: call.contractAddress, data: call.data, value: `0x${BigInt(call.value).toString(16)}` }],
    })) as string;
    await record(call.intentId, hash);
    await waitForReceipt(ethereum, hash);
    hashes.push(hash);
  }
  return hashes;
}

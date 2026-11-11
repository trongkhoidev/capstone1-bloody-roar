import { expect, test } from "bun:test";
import { createRpcClient, getLogs, getReceipt, getSafeBlock, RpcRangeError } from "../src/chain/rpc";

// A fetch that answers every POST with the given JSON-RPC body.
const fetchReturning = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

test("returns the result and sends the safe tag for getSafeBlock", async () => {
  let sent: { method: string; params: unknown[] } | undefined;
  const doFetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ result: { number: "0x64", hash: "0xabc" } }));
  }) as unknown as typeof fetch;
  const rpc = createRpcClient({ url: "http://rpc", fetch: doFetch });
  expect(await getSafeBlock(rpc)).toEqual({ number: 100n, hash: "0xabc" });
  expect(sent?.method).toBe("eth_getBlockByNumber");
  expect(sent?.params).toEqual(["safe", false]);
  expect(rpc.errorStreak).toBe(0);
});

test("a range refusal is a RpcRangeError and does not count as an outage", async () => {
  const rpc = createRpcClient({
    url: "http://rpc",
    fetch: fetchReturning({ error: { code: -32005, message: "Log response size exceeded. Use up to a 2K block range" } }),
  });
  await expect(getLogs(rpc, { address: "0x1", fromBlock: 1n, toBlock: 9999n })).rejects.toBeInstanceOf(RpcRangeError);
  expect(rpc.errorStreak).toBe(0);
});

test("only range-limit wording is a range error; a rate limit with the same code is not", async () => {
  const limited = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ error: { code: -32005, message: "daily request count exceeded, request rate limited" } }) });
  await expect(getLogs(limited, { address: "0x1", fromBlock: 1n, toBlock: 2n })).rejects.toThrow("eth_getLogs failed");
  expect(limited.errorStreak).toBe(1);

  const tooWide = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ error: { code: -32602, message: "query returned more than 10000 results" } }) });
  await expect(getLogs(tooWide, { address: "0x1", fromBlock: 1n, toBlock: 2n })).rejects.toBeInstanceOf(RpcRangeError);
});

test("other RPC errors count toward the error streak", async () => {
  const rpc = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ error: { code: -32000, message: "nope" } }) });
  await expect(getSafeBlock(rpc)).rejects.toThrow("eth_getBlockByNumber failed: nope");
  await expect(getSafeBlock(rpc)).rejects.toThrow();
  expect(rpc.errorStreak).toBe(2);
});

test("maps a receipt status to 0 or 1", async () => {
  const ok = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ result: { status: "0x1", blockNumber: "0x10", transactionHash: "0xt" } }) });
  expect(await getReceipt(ok, "0xt")).toEqual({ status: 1, blockNumber: 16n, transactionHash: "0xt" });
  const reverted = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ result: { status: "0x0", blockNumber: "0x10", transactionHash: "0xt" } }) });
  expect((await getReceipt(reverted, "0xt"))?.status).toBe(0);
  const pending = createRpcClient({ url: "http://rpc", fetch: fetchReturning({ result: null }) });
  expect(await getReceipt(pending, "0xt")).toBeNull();
});

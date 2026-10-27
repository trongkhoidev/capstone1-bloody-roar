// Minimal JSON-RPC client. viem is not allowed for A3 (only pg and @types/pg), so the
// few calls the worker needs are written here. Decoding of escrow logs lives in A2's code.
export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
};

export type RpcBlock = { number: bigint; hash: string };
export type RpcReceipt = { status: 0 | 1; blockNumber: bigint; transactionHash: string };

// The RPC refused the block range. The caller halves the range and retries.
export class RpcRangeError extends Error {}

type RpcOptions = { url: string; fetch?: typeof fetch; timeoutMs?: number };

export type RpcClient = {
  call<T>(method: string, params: unknown[]): Promise<T>;
  readonly lastLatencyMs: number | null;
  readonly errorStreak: number;
};

// Range-limit wording from the providers we use. Not -32005 alone: Infura uses that code for rate limits too.
const RANGE_ERROR = /block range|range is too (large|wide)|query returned more than|too many (results|logs)/i;

export function createRpcClient({ url, fetch: doFetch = fetch, timeoutMs = 10_000 }: RpcOptions): RpcClient {
  let id = 0;
  let lastLatencyMs: number | null = null;
  let errorStreak = 0;

  return {
    get lastLatencyMs() {
      return lastLatencyMs;
    },
    get errorStreak() {
      return errorStreak;
    },
    async call<T>(method: string, params: unknown[]): Promise<T> {
      const started = performance.now();
      try {
        const res = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) {
          if (RANGE_ERROR.test(body.error.message)) throw new RpcRangeError(body.error.message);
          throw new Error(`${method} failed: ${body.error.message}`);
        }
        errorStreak = 0;
        return body.result as T;
      } catch (err) {
        if (!(err instanceof RpcRangeError)) errorStreak++;
        throw err;
      } finally {
        lastLatencyMs = Math.round(performance.now() - started);
      }
    },
  };
}

const toBlock = (block: { number: string; hash: string } | null): RpcBlock | null =>
  block ? { number: BigInt(block.number), hash: block.hash } : null;

// null when the node has no "safe" tag yet
export async function getSafeBlock(rpc: RpcClient): Promise<RpcBlock | null> {
  return toBlock(await rpc.call("eth_getBlockByNumber", ["safe", false]));
}

export async function getBlockByNumber(rpc: RpcClient, number: bigint): Promise<RpcBlock | null> {
  return toBlock(await rpc.call("eth_getBlockByNumber", [`0x${number.toString(16)}`, false]));
}

export async function getLogs(
  rpc: RpcClient,
  { address, fromBlock, toBlock }: { address: string; fromBlock: bigint; toBlock: bigint },
): Promise<RawLog[]> {
  return rpc.call<RawLog[]>("eth_getLogs", [
    { address, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}` },
  ]);
}

export async function getReceipt(rpc: RpcClient, txHash: string): Promise<RpcReceipt | null> {
  const raw = await rpc.call<{ status: string; blockNumber: string; transactionHash: string } | null>(
    "eth_getTransactionReceipt",
    [txHash],
  );
  if (!raw) return null;
  return { status: raw.status === "0x1" ? 1 : 0, blockNumber: BigInt(raw.blockNumber), transactionHash: raw.transactionHash };
}

export const hexToNumber = (hex: string): number => Number(BigInt(hex));

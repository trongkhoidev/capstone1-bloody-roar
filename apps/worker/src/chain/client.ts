import { createPublicClient, http } from "@bloody-roar/shared";

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
export type RpcReceipt = { status: 0 | 1; blockNumber: bigint; transactionHash: string; to?: string | null };

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
  const client = createPublicClient({ transport: http(url, { timeout: timeoutMs, retryCount: 0, ...(doFetch !== fetch ? { fetchFn: doFetch } : {}) }) });
  const request = client.request as unknown as (args: { method: string; params: unknown[] }) => Promise<unknown>;
  let lastLatencyMs: number | null = null;
  let errorStreak = 0;
  return {
    get lastLatencyMs() { return lastLatencyMs; },
    get errorStreak() { return errorStreak; },
    async call<T>(method: string, params: unknown[]): Promise<T> {
      const started = performance.now();
      try {
        const result = await request({ method, params });
        errorStreak = 0;
        return result as T;
      } catch (error) {
        const details = error && typeof error === "object" && "details" in error ? error.details : undefined;
        const short = error && typeof error === "object" && "shortMessage" in error ? error.shortMessage : undefined;
        const message = typeof details === "string" ? details : typeof short === "string" ? short : error instanceof Error ? error.message : String(error);
        if (RANGE_ERROR.test(message)) throw new RpcRangeError(message);
        errorStreak++;
        throw new Error(`${method} failed: ${message}`, { cause: error });
      } finally {
        lastLatencyMs = Math.round(performance.now() - started);
      }
    },
  };
}

const toBlock = (block: { number: string; hash: string } | null): RpcBlock | null =>
  block ? { number: BigInt(block.number), hash: block.hash } : null;

// null when the node has no "safe" tag yet
export async function getSafeBlock(rpc: RpcClient, finality: "safe" | "latest" = "safe"): Promise<RpcBlock | null> {
  return toBlock(await rpc.call("eth_getBlockByNumber", [finality, false]));
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
  const raw = await rpc.call<{ status: string; blockNumber: string; transactionHash: string; to?: string | null } | null>(
    "eth_getTransactionReceipt",
    [txHash],
  );
  if (!raw) return null;
  return { status: raw.status === "0x1" ? 1 : 0, blockNumber: BigInt(raw.blockNumber), transactionHash: raw.transactionHash, ...(raw.to !== undefined ? { to: raw.to } : {}) };
}

export const hexToNumber = (hex: string): number => Number(BigInt(hex));

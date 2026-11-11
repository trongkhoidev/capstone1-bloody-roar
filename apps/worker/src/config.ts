// Worker env (BE-60, worker part). Hand-checked instead of zod: A3 may add only pg and @types/pg.
export type WorkerConfig = {
  port: number;
  rpcUrl: string;
  chainId: number;
  escrowAddress: string; // lowercase 0x address, stored lowercase in ChainEvent
  escrowDeployBlock: bigint;
  rangeSize: number; // max blocks per eth_getLogs; halved when the RPC refuses a range
  reorgWindow: number; // how far back a reorg rewinds the cursor
  lockUrl: string; // DIRECT_URL: advisory locks need a session, not a pooled connection
  alertWebhookUrl: string | undefined;
};

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): WorkerConfig {
  const errors: string[] = [];
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) errors.push(`${key} is required`);
    return value ?? "";
  };
  const integer = (key: string, fallback: number, min: number): number => {
    const raw = env[key]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) errors.push(`${key} must be an integer >= ${min}`);
    return value;
  };

  const rpcUrl = required("RPC_URL");
  if (rpcUrl && !URL.canParse(rpcUrl)) errors.push("RPC_URL must be a URL");
  const chainIdRaw = required("CHAIN_ID");
  if (chainIdRaw && !/^[1-9]\d*$/.test(chainIdRaw)) errors.push("CHAIN_ID must be a positive integer");
  const escrowAddress = required("ESCROW_ADDRESS");
  const deployBlockRaw = required("ESCROW_DEPLOY_BLOCK");
  if (escrowAddress && !/^0x[0-9a-fA-F]{40}$/.test(escrowAddress)) errors.push("ESCROW_ADDRESS must be a 0x address");
  if (deployBlockRaw && !/^\d+$/.test(deployBlockRaw)) errors.push("ESCROW_DEPLOY_BLOCK must be a block number");
  const databaseUrl = env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim();
  if (!databaseUrl) errors.push("DIRECT_URL or DATABASE_URL is required");

  if (errors.length > 0) throw new Error(`Invalid worker config: ${errors.join("; ")}`);
  return {
    port: integer("WORKER_PORT", 4300, 1),
    rpcUrl,
    chainId: Number(chainIdRaw),
    escrowAddress: escrowAddress.toLowerCase(),
    escrowDeployBlock: BigInt(deployBlockRaw),
    rangeSize: integer("INDEXER_RANGE_SIZE", 2000, 1),
    reorgWindow: integer("INDEXER_REORG_WINDOW", 64, 1),
    lockUrl: databaseUrl ?? "",
    alertWebhookUrl: env.ALERT_WEBHOOK_URL?.trim() || undefined,
  };
}

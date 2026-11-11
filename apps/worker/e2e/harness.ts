// Local Hardhat node for E2E runs (BE-41e). Run `bun run contracts:compile` once first.
// Escrow deposits need A2's calldata encoder; until it lands, MockUSDC transfers stand in for chain activity.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRpcClient, type RpcClient } from "../src/chain/rpc";

const CONTRACTS = new URL("../../contracts/", import.meta.url);
const TRANSFER = "0xa9059cbb";
const MINT = "0x40c10f19";
const GAS = "0x30d40";
const pad = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");

export type LocalNode = { url: string; rpc: RpcClient; stop(): Promise<void> };

export async function startHardhatNode(port: number): Promise<LocalNode> {
  // Spawn the binary itself: killing a `bunx` wrapper would leave the node holding the port.
  const child: ChildProcess = spawn(process.execPath, [new URL("node_modules/.bin/hardhat", CONTRACTS).pathname, "node", "--port", String(port)], {
    cwd: CONTRACTS,
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  const rpc = createRpcClient({ url });
  for (let i = 0; i < 100; i++) {
    try {
      await rpc.call("eth_blockNumber", []);
      return { url, rpc, stop: () => stopChild(child) };
    } catch {
      await sleep(200);
    }
  }
  await stopChild(child);
  throw new Error(`hardhat node did not answer on ${url}`);
}

export async function deployMockUsdc(rpc: RpcClient, from: string): Promise<{ address: string; blockNumber: bigint }> {
  const artifact = JSON.parse(
    readFileSync(new URL("artifacts/contracts/MockUSDC.sol/MockUSDC.json", CONTRACTS), "utf8"),
  ) as { bytecode: string };
  const receipt = await sendTx(rpc, { from, data: artifact.bytecode, gas: "0xf00000" });
  return { address: String(receipt.contractAddress).toLowerCase(), blockNumber: BigInt(String(receipt.blockNumber)) };
}

export const mint = (rpc: RpcClient, token: string, from: string, to: string, amount: bigint) =>
  sendTx(rpc, { from, to: token, data: MINT + pad(to) + pad(`0x${amount.toString(16)}`), gas: GAS });

export const transfer = (rpc: RpcClient, token: string, from: string, to: string, amount: bigint) =>
  sendTx(rpc, { from, to: token, data: TRANSFER + pad(to) + pad(`0x${amount.toString(16)}`), gas: GAS });

export const snapshot = (rpc: RpcClient): Promise<string> => rpc.call<string>("evm_snapshot", []);
export const revert = (rpc: RpcClient, id: string): Promise<boolean> => rpc.call<boolean>("evm_revert", [id]);

// Sends a tx on the automining node and waits for its receipt.
async function sendTx(rpc: RpcClient, tx: Record<string, string>): Promise<Record<string, unknown>> {
  const hash = await rpc.call<string>("eth_sendTransaction", [tx]);
  for (let i = 0; i < 100; i++) {
    const receipt = await rpc.call<Record<string, unknown> | null>("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await sleep(50);
  }
  throw new Error(`no receipt for ${hash}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

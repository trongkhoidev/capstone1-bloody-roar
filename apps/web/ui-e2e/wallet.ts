import type { BrowserContext } from "@playwright/test";
import { rpc } from "../../../tests/e2e/harness/chain";

// Fake injected wallet: forwards every call to the local Hardhat node, whose test accounts are unlocked, so no private key is needed.
export async function injectWallet(context: BrowserContext, address: string) {
  await context.exposeFunction("__hardhatRpc", async (method: string, params: unknown[]) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
    if (method === "eth_chainId") return "0x7a69";
    if (method === "net_version") return "31337";
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    return rpc(method, params);
  });
  await context.addInitScript(() => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: ({ method, params }: { method: string; params?: unknown[] }) =>
        (window as unknown as { __hardhatRpc: (method: string, params: unknown[]) => Promise<unknown> }).__hardhatRpc(method, params ?? []),
      on() {},
      removeListener() {},
    };
  });
}

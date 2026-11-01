import { afterEach, describe, expect, it } from "vitest";
import { ACTIVE_CHAIN } from "../lib/web3/client";
import { walletSigner } from "../lib/web3/send-prepared";

const SIGNED_IN = `0x${"a".repeat(40)}`;
const SELECTED = `0x${"b".repeat(40)}`;

// Injected wallet whose selected account is `account`, already on the active chain.
function injectWallet(account: string) {
  const ethereum = {
    request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      // Chain id from the active chain config, so the test does not depend on NEXT_PUBLIC_CHAIN_ID.
      if (method === "eth_chainId") return ACTIVE_CHAIN.chainHex;
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(`unexpected ${method}`);
    },
  };
  (globalThis as unknown as { ethereum: unknown }).ethereum = ethereum;
  (window as unknown as { ethereum: unknown }).ethereum = ethereum;
}

afterEach(() => {
  delete (globalThis as unknown as { ethereum?: unknown }).ethereum;
  delete (window as unknown as { ethereum?: unknown }).ethereum;
});

describe("walletSigner (K3)", () => {
  it("refuses to sign when the selected wallet account differs from the signed-in account", async () => {
    injectWallet(SELECTED);

    await expect(walletSigner(SIGNED_IN)).rejects.toThrow("khác tài khoản đăng nhập");
  });

  it("returns a signer when the selected account matches, ignoring case", async () => {
    injectWallet(SELECTED);

    const signer = await walletSigner(SELECTED.toUpperCase().replace("0X", "0x"));

    expect((await signer.getAddress()).toLowerCase()).toBe(SELECTED);
  });
});

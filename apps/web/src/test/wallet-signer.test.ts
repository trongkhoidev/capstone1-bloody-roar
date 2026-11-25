import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_CHAIN, setWalletKind } from "../lib/web3/client";
import { sendPreparedCalls, walletSigner } from "../lib/web3/send-prepared";
import { inAppEthersSigner, restoreInAppAccount } from "@/lib/web3/in-app";

vi.mock("@/lib/web3/in-app", () => ({
  inAppEthersSigner: vi.fn(),
  restoreInAppAccount: vi.fn(),
}));

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
  setWalletKind(null);
  vi.resetAllMocks();
  delete (globalThis as unknown as { ethereum?: unknown }).ethereum;
  delete (window as unknown as { ethereum?: unknown }).ethereum;
});

describe("walletSigner (K3)", () => {
  it("refuses to sign when the selected wallet account differs from the signed-in account", async () => {
    injectWallet(SELECTED);

    await expect(walletSigner(SIGNED_IN)).rejects.toThrow("not the signed-in account");
  });

  it("returns a signer when the selected account matches, ignoring case", async () => {
    setWalletKind("injected");
    injectWallet(SELECTED);

    const signer = await walletSigner(SELECTED.toUpperCase().replace("0X", "0x"));

    expect((await signer.getAddress()).toLowerCase()).toBe(SELECTED);
  });
});

describe("walletSigner for Google", () => {
  const account = { address: SIGNED_IN } as NonNullable<Awaited<ReturnType<typeof restoreInAppAccount>>>;

  it("returns the adapter signer without reading window.ethereum", async () => {
    setWalletKind("in-app");
    const readEthereum = vi.fn();
    Object.defineProperty(window, "ethereum", { get: readEthereum, configurable: true });
    const signer = {} as Awaited<ReturnType<typeof inAppEthersSigner>>;
    vi.mocked(restoreInAppAccount).mockResolvedValue(account);
    vi.mocked(inAppEthersSigner).mockResolvedValue(signer);

    expect(await walletSigner(SIGNED_IN.toUpperCase())).toBe(signer);
    expect(inAppEthersSigner).toHaveBeenCalledWith(account);
    expect(readEthereum).not.toHaveBeenCalled();
  });

  it("refuses an account different from the signed-in account", async () => {
    setWalletKind("in-app");
    vi.mocked(restoreInAppAccount).mockResolvedValue(account);

    await expect(walletSigner(SELECTED)).rejects.toThrow("not the signed-in account");
    expect(inAppEthersSigner).not.toHaveBeenCalled();
  });

  it("asks the user to sign in again after the session expires", async () => {
    setWalletKind("in-app");
    vi.mocked(restoreInAppAccount).mockResolvedValue(null);

    await expect(walletSigner(SIGNED_IN)).rejects.toThrow("Your Google wallet session expired.");
    expect(inAppEthersSigner).not.toHaveBeenCalled();
  });

  it("shows the chain and address when the account needs gas", async () => {
    setWalletKind("in-app");
    vi.mocked(restoreInAppAccount).mockResolvedValue(account);
    const sendTransaction = vi.fn().mockRejectedValue(new Error("insufficient funds for gas * price + value"));
    vi.mocked(inAppEthersSigner).mockResolvedValue({ sendTransaction } as unknown as Awaited<ReturnType<typeof inAppEthersSigner>>);
    const record = vi.fn();

    await expect(sendPreparedCalls([{ intentId: "intent", contractAddress: SELECTED, data: "0x", value: "0" }], record, SIGNED_IN))
      .rejects.toThrow(`Your wallet needs ${ACTIVE_CHAIN.name} ETH for gas. Address: ${SIGNED_IN}`);
    expect(record).not.toHaveBeenCalled();
  });
});

// apps/web/src/lib/web3/client.ts
// Web3 Connector Helpers — injected EVM wallets and SIWE
// Trâm (UI/UX Designer & Test Engineer) — Sprint 1 (S1-AUTH-08)

import { ethers } from "ethers";
import { toChecksumAddress, tryChecksumAddress } from "@/lib/auth/address";

export interface ChainConfig {
  chainId: number;
  chainHex: string;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const BASE_SEPOLIA_CHAIN: ChainConfig = {
  chainId: 84532,
  chainHex: "0x14a34",
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
};

export const LOCALHOST_CHAIN: ChainConfig = {
  chainId: 31337,
  chainHex: "0x7a69",
  name: "Hardhat Localhost",
  rpcUrl: "http://127.0.0.1:8545",
  blockExplorer: "http://localhost:4000",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
};

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
  type: "injected" | "coinbase" | "walletconnect";
}

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: InjectedEthereum[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};

function getInjectedEthereum(walletId?: string): InjectedEthereum | undefined {
  if (typeof window === "undefined") return undefined;
  const injected = (window as Window & { ethereum?: InjectedEthereum }).ethereum;
  if (!injected || !walletId || walletId === "injected") return injected;
  const providers = injected.providers?.length ? injected.providers : [injected];
  if (walletId === "coinbase") return providers.find((provider: InjectedEthereum) => provider.isCoinbaseWallet);
  if (walletId === "metamask") return providers.find((provider: InjectedEthereum) => provider.isMetaMask && !provider.isCoinbaseWallet);
  return injected;
}

export const WALLET_OPTIONS: WalletOption[] = [
  {
    id: "metamask",
    name: "MetaMask",
    icon: "🦊",
    type: "injected",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet Extension",
    icon: "🔵",
    type: "coinbase",
  },
  {
    id: "injected",
    name: "Browser Wallet (Rabby/Brave)",
    icon: "🌐",
    type: "injected",
  },
];

type WalletKind = "in-app" | "injected";
const WALLET_KIND_KEY = "bloody-roar-wallet-kind";

export function getWalletKind(): WalletKind | null {
  try {
    const kind = window.localStorage.getItem(WALLET_KIND_KEY);
    return kind === "in-app" || kind === "injected" ? kind : null;
  } catch {
    return null;
  }
}

export function setWalletKind(kind: WalletKind | null): void {
  try {
    if (kind) window.localStorage.setItem(WALLET_KIND_KEY, kind);
    else window.localStorage.removeItem(WALLET_KIND_KEY);
  } catch {
  }
}

/**
 * Check if an injected Ethereum provider (MetaMask, etc.) is available
 */
export function hasInjectedProvider(walletId?: string): boolean {
  return Boolean(getInjectedEthereum(walletId));
}

/**
 * Request account connection from window.ethereum
 */
export async function connectInjectedWallet(walletId?: string): Promise<string> {
  if (!hasInjectedProvider(walletId)) {
    throw new Error(
      walletId === "coinbase"
        ? "Coinbase Wallet extension not found."
        : walletId === "metamask"
          ? "MetaMask extension not found."
          : "No Web3 wallet found in this browser. Install MetaMask or Rabby Wallet."
    );
  }

  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");
  const result = await ethereum.request({
    method: "eth_requestAccounts",
  });
  const accounts = Array.isArray(result) ? result.filter((account): account is string => typeof account === "string") : [];

  if (!accounts || accounts.length === 0 || !accounts[0]) {
    throw new Error("No wallet account is selected.");
  }

  return toChecksumAddress(accounts[0]);
}

/** Return the selected provider's current EVM chain id. */
export async function getInjectedChainId(walletId?: string): Promise<number> {
  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");
  const chainId = await ethereum.request({ method: "eth_chainId" });
  if (typeof chainId !== "string") throw new Error("Could not determine the wallet network.");
  const parsed = Number.parseInt(chainId, 16);
  if (!Number.isSafeInteger(parsed)) throw new Error("Invalid wallet network.");
  return parsed;
}

/**
 * Move an injected wallet to the network used by this product. Wallets that
 * do not yet know Base Sepolia receive a standard EIP-3085 add-chain request.
 */
export async function ensureChain(chain: ChainConfig, walletId?: string): Promise<void> {
  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");
  if (await getInjectedChainId(walletId) === chain.chainId) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainHex }],
    });
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chain.chainHex,
        chainName: chain.name,
        rpcUrls: [chain.rpcUrl],
        blockExplorerUrls: [chain.blockExplorer],
        nativeCurrency: chain.nativeCurrency,
      }],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainHex }],
    });
  }

  if (await getInjectedChainId(walletId) !== chain.chainId) {
    throw new Error(`Switch your wallet to ${chain.name} to continue.`);
  }
}

// Chain the app talks to: local Hardhat when NEXT_PUBLIC_CHAIN_ID is 31337, otherwise Base Sepolia.
export const ACTIVE_CHAIN: ChainConfig = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532) === 31337 ? LOCALHOST_CHAIN : BASE_SEPOLIA_CHAIN;

export const ensureActiveChain = (walletId?: string) => ensureChain(ACTIVE_CHAIN, walletId);


/**
 * Request user to sign a plain text message using eth_sign / personal_sign
 */
export async function signMessageWithInjected(
  walletAddress: string,
  message: string,
  walletId?: string
): Promise<string> {
  if (!hasInjectedProvider(walletId)) {
    throw new Error("The Web3 wallet is not ready.");
  }

  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");

  try {
    const from = (tryChecksumAddress(walletAddress) ?? walletAddress).toLowerCase();
    const hexMessage = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(message));
    const signature = await ethereum.request({
      method: "personal_sign",
      params: [hexMessage, from],
    });
    if (typeof signature !== "string" || signature.length < 130) {
      throw new Error("The wallet did not return a valid signature.");
    }
    return signature;
  } catch (err: unknown) {
    const walletError = typeof err === "object" && err !== null ? err as { code?: unknown; message?: unknown } : null;
    if (walletError?.code === 4001 || (typeof walletError?.message === "string" && walletError.message.includes("User rejected"))) {
      throw new Error("User rejected the signature request.");
    }
    throw err;
  }
}

/**
 * Truncate Ethereum address for UI display (e.g., 0x1234...abcd)
 */
export { shortenAddress } from "@/lib/utils";

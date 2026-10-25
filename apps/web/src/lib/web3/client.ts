// apps/web/src/lib/web3/client.ts
// Web3 Connector Helpers — MetaMask, Coinbase, Injected & Social Login Mock/Connector
// Trâm (UI/UX Designer & Test Engineer) — Sprint 1 (S1-AUTH-08)

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
  blockExplorer: "http://localhost:3000",
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
  type: "injected" | "coinbase" | "walletconnect" | "social";
  provider?: "google" | "github" | "email";
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
    name: "Coinbase Wallet",
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

export const SOCIAL_OPTIONS: WalletOption[] = [
  {
    id: "google",
    name: "Tiếp tục với Google",
    icon: "🌐",
    type: "social",
    provider: "google",
  },
  {
    id: "github",
    name: "Tiếp tục với GitHub",
    icon: "🐙",
    type: "social",
    provider: "github",
  },
  {
    id: "email",
    name: "Đăng nhập bằng Email OTP",
    icon: "✉️",
    type: "social",
    provider: "email",
  },
];

/**
 * Check if an injected Ethereum provider (MetaMask, etc.) is available
 */
export function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined";
}

/**
 * Request account connection from window.ethereum
 */
export async function connectInjectedWallet(): Promise<string> {
  if (!hasInjectedProvider()) {
    throw new Error(
      "Không tìm thấy ví Web3 trên trình duyệt. Vui lòng cài đặt MetaMask hoặc Rabby Wallet."
    );
  }

  const ethereum = (window as any).ethereum;
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0 || !accounts[0]) {
    throw new Error("Không có tài khoản ví nào được chọn.");
  }

  return accounts[0];
}

/**
 * Request user to sign a plain text message using eth_sign / personal_sign
 */
export async function signMessageWithInjected(
  walletAddress: string,
  message: string
): Promise<string> {
  if (!hasInjectedProvider()) {
    throw new Error("Ví Web3 chưa sẵn sàng.");
  }

  const ethereum = (window as any).ethereum;
  
  // Convert message to hex for personal_sign
  const hexMessage = `0x${Buffer.from(message, "utf8").toString("hex")}`;

  try {
    const signature = (await ethereum.request({
      method: "personal_sign",
      params: [hexMessage, walletAddress],
    })) as string;

    return signature;
  } catch (err: any) {
    if (err?.code === 4001 || err?.message?.includes("User rejected")) {
      throw new Error("User rejected the signature request.");
    }
    throw err;
  }
}

/**
 * Truncate Ethereum address for UI display (e.g., 0x1234...abcd)
 */
export function shortenAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

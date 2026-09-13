// apps/web/src/lib/web3/client.ts
// Web3 Connector Helpers — injected EVM wallets and SIWE
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
  type: "injected" | "coinbase" | "walletconnect" | "social";
  provider?: "google" | "github" | "email";
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
        ? "Không tìm thấy Coinbase Wallet Extension."
        : walletId === "metamask"
          ? "Không tìm thấy MetaMask Extension."
          : "Không tìm thấy ví Web3 trên trình duyệt. Vui lòng cài đặt MetaMask hoặc Rabby Wallet."
    );
  }

  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  const result = await ethereum.request({
    method: "eth_requestAccounts",
  });
  const accounts = Array.isArray(result) ? result.filter((account): account is string => typeof account === "string") : [];

  if (!accounts || accounts.length === 0 || !accounts[0]) {
    throw new Error("Không có tài khoản ví nào được chọn.");
  }

  return accounts[0];
}

/** Return the selected provider's current EVM chain id. */
export async function getInjectedChainId(walletId?: string): Promise<number> {
  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  const chainId = await ethereum.request({ method: "eth_chainId" });
  if (typeof chainId !== "string") throw new Error("Không thể xác định mạng của ví.");
  const parsed = Number.parseInt(chainId, 16);
  if (!Number.isSafeInteger(parsed)) throw new Error("Mạng ví không hợp lệ.");
  return parsed;
}

/**
 * Move an injected wallet to the network used by this product. Wallets that
 * do not yet know Base Sepolia receive a standard EIP-3085 add-chain request.
 */
export async function ensureBaseSepolia(walletId?: string): Promise<void> {
  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  if (await getInjectedChainId(walletId) === BASE_SEPOLIA_CHAIN.chainId) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN.chainHex }],
    });
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BASE_SEPOLIA_CHAIN.chainHex,
        chainName: BASE_SEPOLIA_CHAIN.name,
        rpcUrls: [BASE_SEPOLIA_CHAIN.rpcUrl],
        blockExplorerUrls: [BASE_SEPOLIA_CHAIN.blockExplorer],
        nativeCurrency: BASE_SEPOLIA_CHAIN.nativeCurrency,
      }],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN.chainHex }],
    });
  }

  if (await getInjectedChainId(walletId) !== BASE_SEPOLIA_CHAIN.chainId) {
    throw new Error("Vui lòng chuyển ví sang Base Sepolia để tiếp tục.");
  }
}

/**
 * Request user to sign a plain text message using eth_sign / personal_sign
 */
export async function signMessageWithInjected(
  walletAddress: string,
  message: string,
  walletId?: string
): Promise<string> {
  if (!hasInjectedProvider(walletId)) {
    throw new Error("Ví Web3 chưa sẵn sàng.");
  }

  const ethereum = getInjectedEthereum(walletId);
  if (!ethereum) throw new Error("Ví Web3 chưa sẵn sàng.");
  
  // Convert message to hex for personal_sign
  const hexMessage = `0x${Array.from(new TextEncoder().encode(message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

  try {
    const signature = await ethereum.request({
      method: "personal_sign",
      params: [hexMessage, walletAddress],
    });
    if (typeof signature !== "string") throw new Error("Wallet returned an invalid signature.");

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
export function shortenAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

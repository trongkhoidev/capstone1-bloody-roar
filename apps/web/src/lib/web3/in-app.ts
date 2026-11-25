import { createThirdwebClient, defineChain } from "thirdweb";
import { ethers5Adapter } from "thirdweb/adapters/ethers5";
import type { Account } from "thirdweb/wallets";
import { inAppWallet } from "thirdweb/wallets/in-app";
import { ACTIVE_CHAIN } from "./client";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim();
const chain = defineChain({ id: ACTIVE_CHAIN.chainId, rpc: ACTIVE_CHAIN.rpcUrl });
let client: ReturnType<typeof createThirdwebClient> | undefined;
let wallet: ReturnType<typeof inAppWallet> | undefined;

export function isInAppConfigured(): boolean {
  return Boolean(clientId);
}

function getClient() {
  if (!clientId) throw new Error("Google sign-in is not configured on this server.");
  return (client ??= createThirdwebClient({ clientId }));
}

function getWallet() {
  return (wallet ??= inAppWallet({ auth: { options: ["google"] } }));
}

export async function connectGoogle(): Promise<Account> {
  return getWallet().connect({ client: getClient(), strategy: "google", chain });
}

export async function restoreInAppAccount(): Promise<Account | null> {
  if (!isInAppConfigured()) return null;
  try {
    return await getWallet().autoConnect({ client: getClient(), chain });
  } catch {
    return null;
  }
}

export function inAppEthersSigner(account: Account) {
  return ethers5Adapter.signer.toEthers({ client: getClient(), chain, account });
}

export async function disconnectInApp(): Promise<void> {
  if (!wallet?.getAccount()) await restoreInAppAccount();
  await wallet?.disconnect();
}

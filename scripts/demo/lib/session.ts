import { ethers, type Wallet } from "./ethers";
import { createLoginMessage, type SiweLoginPayload } from "../../../apps/web/src/lib/auth/siwe";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface UserSession {
  role: string;
  address: string;
  ip: string;
  cookie: string;
  wallet: Wallet;
}

const sessionCache = new Map<string, UserSession>();

export function getDeterministicIp(role: string): string {
  let hash = 0;
  for (let i = 0; i < role.length; i++) {
    hash = (hash << 5) - hash + role.charCodeAt(i);
    hash |= 0;
  }
  const octet = (Math.abs(hash) % 240) + 10;
  return `10.77.${octet}.1`;
}

export async function loginWallet(
  role: string,
  privateKey: string,
  baseUrl = process.env.BASE_URL || "http://localhost:4001"
): Promise<UserSession> {
  const cached = sessionCache.get(role);
  if (cached) return cached;

  const rpcUrl = process.env.RPC_URL || ((process.env.CHAIN_ID || "31337") === "31337" ? "http://127.0.0.1:8545" : "https://sepolia.base.org");
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = wallet.address;
  const ip = getDeterministicIp(role);

  const requestNonce = async () => {
    try {
      return await fetch(`${baseUrl}/api/auth/nonce?address=${encodeURIComponent(address)}`, {
        headers: { "x-forwarded-for": ip },
      });
    } catch {
      return null;
    }
  };

  let nonceRes = await requestNonce();
  for (let attempt = 0; (!nonceRes || nonceRes.status === 404 || nonceRes.status >= 500) && attempt < 15; attempt++) {
    await sleep(2000);
    nonceRes = await requestNonce();
  }

  if (!nonceRes || !nonceRes.ok) {
    throw new Error(`Nonce request failed for ${role} (${address}): HTTP ${nonceRes?.status ?? "ERR"}`);
  }

  const payload = (await nonceRes.json()) as SiweLoginPayload;
  const message = createLoginMessage(payload);
  const signature = await wallet.signMessage(message);

  let loginRes: Response | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ payload, signature }),
      });
      if (loginRes.ok) break;
      await sleep(2000);
    } catch {
      await sleep(2000);
    }
  }

  if (!loginRes || !loginRes.ok) {
    throw new Error(`Login failed for ${role} (${address}): HTTP ${loginRes?.status ?? "ERR"}`);
  }

  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  const session: UserSession = { role, address, ip, cookie, wallet };
  sessionCache.set(role, session);
  return session;
}

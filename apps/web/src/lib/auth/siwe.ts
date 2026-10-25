import { buildJWT } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";

export type SiweLoginPayload = {
  domain: string;
  address: string;
  statement?: string;
  version: string;
  uri?: string;
  chain_id?: string;
  nonce: string;
  issued_at: string;
  expiration_time: string;
  invalid_before?: string;
  resources?: string[];
};

export type SignedSiwePayload = {
  payload: SiweLoginPayload;
  signature: string;
};

/** Same EIP-4361 formatter Thirdweb Auth uses when verifying. */
export function createLoginMessage(payload: SiweLoginPayload): string {
  const header = `${payload.domain} wants you to sign in with your Ethereum account:`;
  let prefix = [header, payload.address].join("\n");
  prefix = [prefix, payload.statement].join("\n\n");
  if (payload.statement) prefix += "\n";

  const suffix: string[] = [];
  if (payload.uri) suffix.push(`URI: ${payload.uri}`);
  suffix.push(`Version: ${payload.version}`);
  if (payload.chain_id) suffix.push(`Chain ID: ${payload.chain_id}`);
  suffix.push(`Nonce: ${payload.nonce}`);
  suffix.push(`Issued At: ${payload.issued_at}`);
  suffix.push(`Expiration Time: ${payload.expiration_time}`);
  if (payload.invalid_before) suffix.push(`Not Before: ${payload.invalid_before}`);
  if (payload.resources?.length) {
    suffix.push(["Resources:", ...payload.resources.map((resource) => `- ${resource}`)].join("\n"));
  }
  return [prefix, suffix.join("\n")].join("\n");
}

export function authDomain(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
    "localhost:4000"
  );
}

export async function issueAuthToken(walletAddress: string): Promise<string> {
  const privateKey = process.env.AUTH_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("AUTH_PRIVATE_KEY is not configured");
  }
  const wallet = new PrivateKeyWallet(privateKey);
  return buildJWT({
    wallet,
    payload: {
      iss: await wallet.getAddress(),
      sub: walletAddress,
      aud: authDomain(),
      nbf: new Date(),
      exp: new Date(Date.now() + 1000 * 60 * 60 * 24),
      iat: new Date(),
    },
  });
}

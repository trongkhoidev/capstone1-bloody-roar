import { buildJWT } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { utils } from "ethers";

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

function recoverSigner(message: string, signature: string): string | undefined {
  try {
    const normalized =
      signature.startsWith("0x") || signature.startsWith("0X")
        ? signature
        : `0x${signature}`;
    return utils.recoverAddress(utils.hashMessage(message), normalized);
  } catch {
    return undefined;
  }
}

export function verifySiweLogin(
  signed: SignedSiwePayload,
  expectedDomain: string,
): string {
  const { payload, signature } = signed;
  if (!payload?.address || !payload?.nonce || !signature) {
    throw new Error("Invalid login payload");
  }
  if (payload.domain !== expectedDomain) {
    throw new Error(
      `Expected domain '${expectedDomain}' does not match domain on payload '${payload.domain}'`,
    );
  }

  const now = new Date();
  if (payload.invalid_before && now < new Date(payload.invalid_before)) {
    throw new Error("Login request is not yet valid");
  }
  if (now > new Date(payload.expiration_time)) {
    throw new Error("Login request has expired");
  }

  const message = createLoginMessage(payload);
  const recovered = recoverSigner(message, signature);
  if (!recovered || recovered.toLowerCase() !== payload.address.toLowerCase()) {
    throw new Error(
      `Signer address does not match payload address '${payload.address.toLowerCase()}'`,
    );
  }
  return recovered;
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

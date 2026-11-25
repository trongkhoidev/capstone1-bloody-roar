
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

export function authUri(rawUrl?: string): string {
  // Read the runtime URL set by the custom server before Next.js starts.
  const { NEXT_PUBLIC_APP_URL } = process.env;
  const target = rawUrl ?? NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
  try {
    const parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
    return parsed.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid HTTP or HTTPS URL");
  }
}

export function authDomain(rawUrl?: string): string {
  return new URL(authUri(rawUrl)).host;
}

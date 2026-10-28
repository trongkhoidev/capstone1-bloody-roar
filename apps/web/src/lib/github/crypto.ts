// apps/web/src/lib/github/crypto.ts
// Both GitHub routes must use the same key bytes, or the state signature never verifies.

export function keyBytes(): Buffer | null {
  const encoded = process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? "";
  if (/^[\da-fA-F]{64}$/.test(encoded)) return Buffer.from(encoded, "hex");
  if (/^[A-Za-z0-9_-]{43}$/.test(encoded)) return Buffer.from(encoded, "base64url");
  return null;
}

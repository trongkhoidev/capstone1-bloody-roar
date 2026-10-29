// Wallets listed in ADMIN_WALLETS (comma-separated) are promoted to ADMIN on sign-in.
// Removing a wallet from the list does not demote it; use the database for that.
export function isConfiguredAdmin(walletAddress: string): boolean {
  const configured = (process.env.ADMIN_WALLETS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(walletAddress.toLowerCase());
}

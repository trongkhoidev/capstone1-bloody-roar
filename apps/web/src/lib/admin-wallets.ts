// Wallets listed in ADMIN_WALLETS (comma-separated) are promoted to ADMIN on sign-in.
// Removing a wallet from the list does not demote it; use the database for that.
export function parseAdminWallets(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdmin(walletAddress: string): boolean {
  return parseAdminWallets(process.env.ADMIN_WALLETS).includes(walletAddress.toLowerCase());
}

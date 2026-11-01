import { afterEach, describe, expect, it, vi } from "vitest";
import { isConfiguredAdmin, parseAdminWallets } from "../lib/admin-wallets";

describe("ADMIN_WALLETS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trims spaces, lowercases and drops empty entries", () => {
    expect(parseAdminWallets(" 0xAbC ,  0xDEF ,, ")).toEqual(["0xabc", "0xdef"]);
  });

  it("is empty when unset or blank", () => {
    expect(parseAdminWallets(undefined)).toEqual([]);
    expect(parseAdminWallets("  ")).toEqual([]);
  });

  it("matches a sign-in address regardless of case", () => {
    vi.stubEnv("ADMIN_WALLETS", " 0xABCDEF , 0x123 ");
    expect(isConfiguredAdmin("0xabcdef")).toBe(true);
    expect(isConfiguredAdmin("0xABCDEF")).toBe(true);
    expect(isConfiguredAdmin("0x999")).toBe(false);
  });
});

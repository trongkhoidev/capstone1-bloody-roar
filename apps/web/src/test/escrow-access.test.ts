import { describe, expect, it } from "vitest";
import { assertEscrowAccess } from "../lib/escrow/access";

describe("escrow authorization policy", () => {
  it("allows only the client to confirm deposits and releases", () => {
    const escrow = { clientId: "client", developerId: "developer" };

    expect(() => assertEscrowAccess("client", "DEPOSIT", escrow)).not.toThrow();
    expect(() => assertEscrowAccess("developer", "RELEASE", escrow)).toThrow("Only the escrow client");
  });

  it("allows either recorded participant to confirm a refund or dispute", () => {
    const escrow = { clientId: "client", developerId: "developer" };

    expect(() => assertEscrowAccess("client", "CANCEL", escrow)).not.toThrow();
    expect(() => assertEscrowAccess("developer", "DISPUTE", escrow)).not.toThrow();
    expect(() => assertEscrowAccess("outsider", "CANCEL", escrow)).toThrow("Only escrow participants");
  });
});

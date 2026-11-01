import { describe, expect, it } from "vitest";
import { isEmailConflict, normalizeProfileInput } from "../graphql/modules/user/profile-input";

describe("normalizeProfileInput", () => {
  it("normalizes an email before persistence", () => {
    expect(normalizeProfileInput({ email: "  Hieu@Example.COM  " }).email).toBe("hieu@example.com");
  });

  it("turns an empty email into null", () => {
    expect(normalizeProfileInput({ email: "   " }).email).toBeNull();
  });

  it("rejects an invalid email", () => {
    expect(() => normalizeProfileInput({ email: "not-an-email" })).toThrow();
  });

  it("recognizes only Prisma email uniqueness conflicts", () => {
    expect(isEmailConflict({ code: "P2002", meta: { target: ["email"] } })).toBe(true);
    expect(isEmailConflict({ code: "P2002", meta: { target: ["walletAddress"] } })).toBe(false);
    expect(isEmailConflict(new Error("database unavailable"))).toBe(false);
  });
});

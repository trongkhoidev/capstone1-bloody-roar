import { describe, expect, it, vi } from "vitest";

const { authenticate, findSession } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findSession: vi.fn(),
}));
vi.mock("@thirdweb-dev/auth", () => ({ ThirdwebAuth: class { authenticate = authenticate; } }));
vi.mock("@thirdweb-dev/wallets", () => ({ PrivateKeyWallet: class {} }));
vi.mock("@bloody-roar/database", () => ({ prisma: { session: { findUnique: findSession } } }));
vi.stubEnv("AUTH_PRIVATE_KEY", "test");

describe("session verification", () => {
  it("propagates database failures instead of treating the token as invalid", async () => {
    authenticate.mockResolvedValue({ address: "0x123" });
    findSession.mockRejectedValue(new Error("database unavailable"));
    const { verifySessionJWT, verifyJWT } = await import("@/lib/auth");
    await expect(verifySessionJWT("token")).rejects.toThrow("database unavailable");
    await expect(verifyJWT("token")).resolves.toBeNull();
  });
});

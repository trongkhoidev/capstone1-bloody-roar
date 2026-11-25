import { ethers } from "ethers";
import { afterEach, expect, it, vi } from "vitest";
import { createLoginMessage, type SiweLoginPayload } from "@/lib/auth/siwe";

vi.mock("@bloody-roar/database", () => ({
  prisma: {
    authChallenge: { create: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      authChallenge: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { upsert: ({ create }: { create: { walletAddress: string } }) => create },
      session: { create: vi.fn() },
    }),
  },
  UserRole: { ADMIN: "ADMIN" },
}));

afterEach(() => vi.unstubAllEnvs());

it("accepts a SIWE signature from a fresh EOA and sets the auth cookie", async () => {
  vi.stubEnv("AUTH_PRIVATE_KEY", ethers.Wallet.createRandom().privateKey);
  const [{ GET }, { POST }] = await Promise.all([
    import("../app/api/auth/nonce/route"),
    import("../app/api/auth/login/route"),
  ]);
  const wallet = ethers.Wallet.createRandom();
  const nonce = await GET(new Request(`http://localhost:4000/api/auth/nonce?address=${wallet.address}`));
  expect(nonce.status).toBe(200);
  const payload: SiweLoginPayload = await nonce.json();
  const signature = await wallet.signMessage(createLoginMessage(payload));

  const response = await POST(new Request("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, signature }),
  }));

  expect(response.status).toBe(200);
  expect((await response.json()).user.walletAddress).toBe(wallet.address.toLowerCase());
  expect(response.headers.get("set-cookie")).toMatch(/^bloody_token=.+;.*HttpOnly/i);
});

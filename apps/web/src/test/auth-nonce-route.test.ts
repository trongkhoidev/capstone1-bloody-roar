import { describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/auth/nonce/route";

vi.mock("@bloody-roar/database", () => ({
  prisma: { authChallenge: { create: vi.fn(async () => ({})) } },
}));
vi.mock("../lib/auth", () => ({
  thirdwebAuth: () => ({
    payload: async ({ address }: { address: string }) => ({ address, nonce: crypto.randomUUID() }),
  }),
}));
vi.mock("../lib/auth/siwe", () => ({ authDomain: () => "localhost:4000" }));

const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function nonceRequest(ip: string) {
  return new Request(`http://localhost:4000/api/auth/nonce?address=${ADDRESS}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/auth/nonce", () => {
  it("answers 429 with Retry-After once one address passes its limit", async () => {
    let response: Response | undefined;
    for (let i = 0; i < 11; i++) response = await GET(nonceRequest("203.0.113.7"));

    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

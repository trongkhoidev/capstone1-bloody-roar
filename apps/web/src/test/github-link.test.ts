import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/auth/github/callback/route";

const prisma = vi.hoisted(() => ({ user: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@bloody-roar/database", () => ({ prisma }));

const KEY = "ab".repeat(32);
const USER_ID = "user-1";

function callbackRequest() {
  const payload = Buffer.from(JSON.stringify({ userId: USER_ID, nonce: "n-1", expiresAt: Date.now() + 60_000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", Buffer.from(KEY, "hex")).update(payload).digest("base64url");
  return new Request("http://localhost:4000/api/auth/github/callback?code=c1&state=n-1", {
    headers: { cookie: `github_oauth_state=${payload}.${signature}` },
  });
}

describe("GET /api/auth/github/callback", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("GITHUB_CLIENT_ID", "client");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:4000");
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("access_token") ? Response.json({ access_token: "gh-token" }) : Response.json({ id: 42, login: "octo" }),
    ));
    prisma.user.findUnique.mockReset();
    prisma.user.update.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("links a GitHub account that no other wallet holds", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toContain("github=connected");
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
    const { data } = prisma.user.update.mock.calls[0]?.[0] as { data: object };
    expect(data).not.toHaveProperty("githubAccessTokenEncrypted");
  });

  it("refuses a GitHub account already linked to another wallet", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-2" });

    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toContain("code=GITHUB_ALREADY_LINKED");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { tokenFromRequest, verifyJWT } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

function configError() {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return "GitHub OAuth is not configured on this server.";
  if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY || !/^(?:[\da-fA-F]{64}|[A-Za-z0-9_-]{43})$/.test(process.env.GITHUB_TOKEN_ENCRYPTION_KEY)) {
    return "Set GITHUB_TOKEN_ENCRYPTION_KEY to a random 32-byte key (64 hex characters) before linking GitHub.";
  }
  return null;
}

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned) return NextResponse.json({ error: "Connect an active wallet before linking GitHub." }, { status: 401 });

  const error = configError();
  if (error) return NextResponse.json({ error }, { status: 503 });

  const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/api/auth/github/callback`;
  const nonce = crypto.randomBytes(24).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId: user.id, nonce, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.GITHUB_TOKEN_ENCRYPTION_KEY!).update(payload).digest("base64url");
  const signedState = `${payload}.${signature}`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", nonce);

  const response = NextResponse.json({ url: url.toString() });
  response.cookies.set("github_oauth_state", signedState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/github/callback",
    maxAge: 600,
  });
  return response;
}

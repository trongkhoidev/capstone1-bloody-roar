import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@bloody-roar/database";

export const dynamic = "force-dynamic";

function redirect(request: Request, result: "connected" | "error") {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  return NextResponse.redirect(new URL(`/profile?github=${result}`, base));
}

function keyBytes() {
  const encoded = process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? "";
  if (/^[\da-fA-F]{64}$/.test(encoded)) return Buffer.from(encoded, "hex");
  if (/^[A-Za-z0-9_-]{43}$/.test(encoded)) return Buffer.from(encoded, "base64url");
  return null;
}

function encryptToken(token: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieState = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("github_oauth_state="))?.slice("github_oauth_state=".length);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const response = redirect(request, "error");
  response.cookies.set("github_oauth_state", "", { path: "/api/auth/github/callback", maxAge: 0 });

  try {
    if (!cookieState || !code || !returnedState || !process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return response;
    const [payload, signature] = decodeURIComponent(cookieState).split(".");
    if (!payload || !signature) return response;
    const key = keyBytes();
    if (!key) return response;
    const expected = crypto.createHmac("sha256", key).update(payload).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return response;
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; nonce: string; expiresAt: number };
    if (state.nonce !== returnedState || state.expiresAt < Date.now()) return response;

    const callbackUrl = process.env.GITHUB_CALLBACK_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? url.origin}/api/auth/github/callback`;
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl }),
      cache: "no-store",
    });
    const tokenResult = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenResult.access_token) return response;

    const githubResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenResult.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Bloody-Roar" },
      cache: "no-store",
    });
    if (!githubResponse.ok) return response;
    const githubUser = await githubResponse.json() as { id?: number; login?: string };
    if (!githubUser.id || !githubUser.login) return response;

    await prisma.user.update({
      where: { id: state.userId },
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubAccessTokenEncrypted: encryptToken(tokenResult.access_token, key),
        isGithubVerified: true,
      },
    });
    const connected = redirect(request, "connected");
    connected.cookies.set("github_oauth_state", "", { path: "/api/auth/github/callback", maxAge: 0 });
    return connected;
  } catch {
    return response;
  }
}

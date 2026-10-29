import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, thirdwebAuth } from "../../../../lib/auth";
import { authDomain, issueAuthToken } from "../../../../lib/auth/siwe";
import { validateSiwePayload } from "../../../../lib/auth/siwe-validation";
import { buildChallengeIdentity, consumeSiweChallenge } from "../../../../lib/auth/challenge";
import { prisma, UserRole } from "@bloody-roar/database";
import { isConfiguredAdmin } from "../../../../lib/admin-wallets";
import crypto from "crypto";
import { createLogger } from "../../../../lib/logger";

const log = createLogger("auth-login");

/** Fields safe to return to the client */
const USER_PUBLIC_SELECT = {
  id: true,
  walletAddress: true,
  role: true,
  name: true,
  avatar: true,
  bio: true,
  skills: true,
  location: true,
  reputationScore: true,
  completedTaskCount: true,
  isGithubVerified: true,
  createdAt: true,
} as const;

export async function POST(req: Request) {
  try {
    const auth = thirdwebAuth();
    const rawPayload: unknown = await req.json();
    const uri = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
    const chainId = "84532";
    const payload = validateSiwePayload(rawPayload, {
      domain: authDomain(),
      uri,
      chainId,
    });
    const walletAddress = await auth.verify(payload, {
      uri,
      version: "1",
      chainId,
    });
    const checksumAddress = walletAddress.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: checksumAddress },
    });
    if (existingUser?.isBanned) {
      return NextResponse.json({ error: "This account is suspended" }, { status: 403 });
    }

    const siweNonce = payload.payload.nonce;

    // Generate JWT
    const token = await issueAuthToken(walletAddress);

    // Parse token to extract exp
    const parsedToken = auth.parseToken(token);
    const expiresAt = new Date(parsedToken.payload.exp * 1000);

    // Hash the JWT for refreshHash (used for logout/revoke/verify)
    const refreshHash = crypto.createHash("sha256").update(token).digest("hex");

    // Extract request metadata
    const userAgent = req.headers.get("user-agent") ?? null;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const challenge = buildChallengeIdentity({
      nonce: siweNonce,
      address: payload.payload.address,
      domain: payload.payload.domain,
      uri: payload.payload.uri!,
      chainId: payload.payload.chain_id!,
    });

    const promoteToAdmin = isConfiguredAdmin(checksumAddress);

    const user = await prisma.$transaction(async (tx) => {
      await consumeSiweChallenge(tx.authChallenge, challenge);
      const persistedUser = await tx.user.upsert({
        where: { walletAddress: checksumAddress },
        create: {
          walletAddress: checksumAddress,
          lastLoginAt: new Date(),
          ...(promoteToAdmin && { role: UserRole.ADMIN }),
        },
        update: {
          lastLoginAt: new Date(),
          ...(promoteToAdmin && { role: UserRole.ADMIN }),
        },
        select: USER_PUBLIC_SELECT,
      });
      await tx.session.create({
        data: {
          userId: persistedUser.id,
          refreshHash,
          nonce: siweNonce,
          userAgent,
          ip: forwardedFor?.split(",", 1)[0]?.trim() ?? realIp ?? null,
          expiresAt,
        },
      });
      return persistedUser;
    });

    const response = NextResponse.json({ token, user });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      expires: expiresAt,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    log.warn({ error: error instanceof Error ? error.message : String(error) }, "Wallet login verification failed");
    return NextResponse.json(
      { error: "Invalid login payload" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
}

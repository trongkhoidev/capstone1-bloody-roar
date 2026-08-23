import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";
import { prisma } from "@bloody-roar/database";
import crypto from "crypto";
import { headers } from "next/headers";

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
    const payload = await req.json();

    // 1. Verify the signed login payload → returns wallet address as string
    const walletAddress = await auth.verify(payload);
    const checksumAddress = walletAddress.toLowerCase();

    // 2. Check if this SIWE nonce has already been used (Payload Replay Protection)
    const siweNonce = payload.payload.nonce;
    const existingSession = await prisma.session.findUnique({
      where: { nonce: siweNonce },
    });
    
    if (existingSession) {
      return NextResponse.json(
        { error: "Login payload already used (replay detected)" },
        { status: 401 }
      );
    }

    // Upsert user (select only public fields)
    const user = await prisma.user.upsert({
      where: { walletAddress: checksumAddress },
      create: {
        walletAddress: checksumAddress,
        lastLoginAt: new Date(),
      },
      update: {
        lastLoginAt: new Date(),
      },
      select: USER_PUBLIC_SELECT,
    });

    // Generate JWT
    const token = await auth.generate(payload);

    // Parse token to extract exp
    const parsedToken = auth.parseToken(token);
    const expiresAt = new Date(parsedToken.payload.exp * 1000);

    // Hash the JWT for refreshHash (used for logout/revoke/verify)
    const refreshHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Extract request metadata
    const reqHeaders = headers();
    const userAgent = reqHeaders.get("user-agent") ?? null;
    const forwardedFor = reqHeaders.get("x-forwarded-for");
    const realIp = reqHeaders.get("x-real-ip");
    const ip = forwardedFor ?? realIp ?? null;

    // Save session with SIWE nonce to prevent replay
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshHash,
        nonce: siweNonce,
        userAgent,
        ip,
        expiresAt,
      },
    });

    return NextResponse.json({ token, user });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Invalid login payload" },
      { status: 401 },
    );
  }
}

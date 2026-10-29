import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@bloody-roar/database";
import { AUTH_COOKIE_NAME, tokenFromRequest, verifyJWT } from "@/lib/auth";
import { disconnectUserSockets } from "@/socket/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  if (token) {
    const user = await verifyJWT(token);
    const refreshHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.session.updateMany({
      where: { refreshHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (user) {
      try {
        disconnectUserSockets(user.id);
      } catch {
        /* No live Socket.io server in isolated route tests. */
      }
    }
  }
  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

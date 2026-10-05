import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, tokenFromRequest, toPublicAuthUser, verifyJWT } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user) return NextResponse.json({ user: null });
  const response = NextResponse.json({ user: toPublicAuthUser(user) });
  response.cookies.set(AUTH_COOKIE_NAME, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

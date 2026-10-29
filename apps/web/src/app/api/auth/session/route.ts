import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, tokenFromRequest, toPublicAuthUser, verifyJWT } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user) {
    const response = NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
  return NextResponse.json(
    { user: toPublicAuthUser(user) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

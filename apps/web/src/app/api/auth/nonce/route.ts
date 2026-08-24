import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = thirdwebAuth();
    const payload = await auth.payload();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 },
    );
  }
}

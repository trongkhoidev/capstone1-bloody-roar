import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get("address") ?? undefined;
    const auth = thirdwebAuth();
    const payload = await auth.payload({ address });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Nonce error:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 },
    );
  }
}

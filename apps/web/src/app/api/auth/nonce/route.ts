import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const address = new URL(req.url).searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "A valid wallet address is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const auth = thirdwebAuth();
    const payload = await auth.payload({ address });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Nonce error:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

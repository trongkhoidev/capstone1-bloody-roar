import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";
import { tryChecksumAddress } from "../../../../lib/auth/address";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const rawAddress = new URL(req.url).searchParams.get("address");
    const address = rawAddress ? tryChecksumAddress(rawAddress) : undefined;
    if (!address) {
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

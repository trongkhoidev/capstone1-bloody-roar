import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";
import { tryChecksumAddress } from "../../../../lib/auth/address";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const rawAddress = new URL(req.url).searchParams.get("address") ?? undefined;
    const address = rawAddress ? tryChecksumAddress(rawAddress) : undefined;
    if (rawAddress && !address) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
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

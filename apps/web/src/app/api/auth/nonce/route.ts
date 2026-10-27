import { NextResponse } from "next/server";
import { thirdwebAuth } from "../../../../lib/auth";
import { tryChecksumAddress } from "../../../../lib/auth/address";
import { prisma } from "@bloody-roar/database";
import { authDomain } from "../../../../lib/auth/siwe";
import { buildChallengeIdentity } from "../../../../lib/auth/challenge";
import { createLogger } from "../../../../lib/logger";
import { clientIp, rateLimit, tooManyRequests } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const log = createLogger("auth-nonce");

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
    const ipLimit = rateLimit(`nonce:ip:${clientIp(req)}`, { limit: 30, windowMs: 60_000 });
    const addressLimit = rateLimit(`nonce:address:${address.toLowerCase()}`, { limit: 10, windowMs: 60_000 });
    if (!ipLimit.ok || !addressLimit.ok) {
      return tooManyRequests(Math.max(ipLimit.retryAfterMs, addressLimit.retryAfterMs));
    }
    const auth = thirdwebAuth();
    const uri = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
    const chainId = "84532";
    const expirationTime = new Date(Date.now() + 10 * 60 * 1000);
    const payload = await auth.payload({
      address,
      uri,
      version: "1",
      chainId,
      expirationTime,
    });
    await prisma.authChallenge.create({
      data: {
        ...buildChallengeIdentity({
          nonce: payload.nonce,
          address: payload.address,
          domain: authDomain(),
          uri,
          chainId,
        }),
        expiresAt: expirationTime,
      },
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    log.error({ err: error }, "Nonce error");
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

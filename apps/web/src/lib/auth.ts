import { ThirdwebAuth } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import { createLogger } from "./logger";
import * as crypto from "crypto";

const log = createLogger("auth");

// Fail gracefully instead of crashing the entire server on import
const AUTH_PRIVATE_KEY = process.env.AUTH_PRIVATE_KEY;
if (!AUTH_PRIVATE_KEY) {
  log.warn("AUTH_PRIVATE_KEY is not set — auth endpoints will be unavailable");
}

/**
 * Thirdweb Auth singleton.
 * Lazy-initialized to avoid crashing the server if AUTH_PRIVATE_KEY is missing.
 */
function getThirdwebAuth(): ThirdwebAuth {
  if (!AUTH_PRIVATE_KEY) {
    throw new Error("AUTH_PRIVATE_KEY is not configured");
  }
  return new ThirdwebAuth(
    new PrivateKeyWallet(AUTH_PRIVATE_KEY),
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
      "localhost:3000",
  );
}

// Singleton instance (created on first use)
let _thirdwebAuth: ThirdwebAuth | null = null;

export function thirdwebAuth(): ThirdwebAuth {
  if (!_thirdwebAuth) {
    _thirdwebAuth = getThirdwebAuth();
  }
  return _thirdwebAuth;
}

/**
 * Verify a JWT and map to DB User.
 *
 * Uses `authenticate` to verify the signature, and then checks the
 * DB for revocation using the `refreshHash` of the token.
 */
export async function verifyJWT(token: string) {
  try {
    const auth = thirdwebAuth();
    const authUser = await auth.authenticate(token);
    if (!authUser?.address) return null;

    // Check if session is revoked via refreshHash
    const refreshHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = await prisma.session.findUnique({
      where: { refreshHash },
    });

    if (!session || session.revokedAt) {
      return null;
    }


    const user = await prisma.user.findUnique({
      where: { walletAddress: authUser.address.toLowerCase() },
    });

    return user;
  } catch {
    return null;
  }
}

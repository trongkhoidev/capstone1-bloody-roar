import { buildJWT, ThirdwebAuth } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import { createLogger } from "./logger";
import { authDomain } from "./auth/siwe";
import * as crypto from "crypto";

const log = createLogger("auth");

export const AUTH_COOKIE_NAME = "bloody_token";

export function tokenFromCookieHeader(cookieHeader: string | null): string | null {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(AUTH_COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

export function tokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return tokenFromCookieHeader(request.headers.get("cookie"));
}

export function toPublicAuthUser(user: Awaited<ReturnType<typeof verifyJWT>>) {
  if (!user) return null;
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    role: user.role,
    name: user.name,
    avatar: user.avatar,
    bio: user.bio,
    skills: user.skills,
    location: user.location,
    reputationScore: user.reputationScore,
    completedTaskCount: user.completedTaskCount,
    isGithubVerified: user.isGithubVerified,
    createdAt: user.createdAt,
  };
}

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
    authDomain(),
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
  return verifySessionJWT(token).catch(() => null);
}

// Session restoration must distinguish an unavailable database from an invalid token.
// A page load fires several requests with the same token; share one lookup for a moment.
const AUTH_CACHE_MS = 30_000;
type CachedSession = { expiresAt: number; result: Promise<Awaited<ReturnType<typeof loadSession>>["user"]> };
const authGlobals = globalThis as typeof globalThis & { bloodyRoarAuthCache?: Map<string, CachedSession> };
const authCache = authGlobals.bloodyRoarAuthCache ??= new Map();

export function clearAuthCache() {
  authCache.clear();
}

export function verifySessionJWT(token: string) {
  const hit = authCache.get(token);
  if (hit && Date.now() < hit.expiresAt) return hit.result;
  const entry: CachedSession = {
    expiresAt: Date.now() + AUTH_CACHE_MS,
    result: loadSession(token).then(({ user, expiresAt }) => {
      entry.expiresAt = Math.min(entry.expiresAt, expiresAt);
      return user;
    }),
  };
  authCache.set(token, entry);
  const forget = () => {
    if (authCache.get(token) === entry) authCache.delete(token);
  };
  entry.result.catch(forget);
  setTimeout(forget, AUTH_CACHE_MS).unref();
  return entry.result;
}

async function loadSession(token: string) {
  const invalid = { user: null, expiresAt: 0 };
  const auth = thirdwebAuth();
  let authUser: Awaited<ReturnType<typeof auth.authenticate>>;
  try {
    authUser = await auth.authenticate(token);
  } catch {
    return invalid;
  }
  if (!authUser?.address) return invalid;

  // Check if session is revoked via refreshHash; one joined query instead of two round trips.
  const refreshHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findUnique({
    where: { refreshHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return invalid;

  const user = session.user;
  if (user.walletAddress !== authUser.address.toLowerCase() || user.isBanned) return invalid;
  return { user, expiresAt: session.expiresAt.getTime() };
}

export async function issueAuthToken(walletAddress: string): Promise<string> {
  const privateKey = process.env.AUTH_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("AUTH_PRIVATE_KEY is not configured");
  }
  const wallet = new PrivateKeyWallet(privateKey);
  return buildJWT({
    wallet,
    payload: {
      iss: await wallet.getAddress(),
      sub: walletAddress,
      aud: authDomain(),
      nbf: new Date(),
      exp: new Date(Date.now() + 1000 * 60 * 60 * 24),
      iat: new Date(),
    },
  });
}

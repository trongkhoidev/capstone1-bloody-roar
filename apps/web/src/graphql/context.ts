// apps/web/src/graphql/context.ts
// GraphQL context factory — injected into every resolver
// Contains: database client, authenticated user, socket.io instance

import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma, type User } from "@bloody-roar/database";
import { createLogger } from "../lib/logger";
import { verifyJWT } from "../lib/auth";

const log = createLogger("graphql-context");

export interface GraphQLContext {
  db: typeof prisma;
  user: User | null; // null = unauthenticated
  req: IncomingMessage;
  res: ServerResponse;
}

/**
 * Extract JWT token from request headers
 * Supports: Authorization: Bearer <token>
 */
function extractToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

/**
 * Verify JWT and return user, or null if invalid
 */
async function verifyToken(token: string): Promise<User | null> {
  return verifyJWT(token);
}

/**
 * GraphQL context factory — called on every request
 */
export async function createContext(
  initialContext: { req: IncomingMessage; res: ServerResponse }
): Promise<GraphQLContext> {
  const { req, res } = initialContext;
  const token = extractToken(req);
  const user = token ? await verifyToken(token) : null;

  if (user) {
    log.debug({ userId: user.id }, "Authenticated GraphQL request");
  }

  return {
    db: prisma,
    user,
    req,
    res,
  };
}

/**
 * Assert user is authenticated — throws if not
 * Use in resolvers that require auth
 */
export function requireAuth(ctx: GraphQLContext): User {
  if (!ctx.user) {
    throw new Error("UNAUTHORIZED: Authentication required");
  }
  return ctx.user;
}

/**
 * Assert user is admin — throws if not
 */
export function requireAdmin(ctx: GraphQLContext): User {
  const user = requireAuth(ctx);
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN: Admin access required");
  }
  return user;
}

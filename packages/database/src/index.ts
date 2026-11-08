// packages/database/src/index.ts
// Re-exports Prisma client + types for use across the monorepo

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Supabase session pooling allows 15 clients in total, shared by web, worker and tooling.
// A URL without connection_limit makes Prisma open cpus*2+1 connections per process and exhausts it.
const databaseUrl = process.env.DATABASE_URL;
const pooledUrl =
  databaseUrl && !databaseUrl.includes("connection_limit=")
    ? `${databaseUrl}${databaseUrl.includes("?") ? "&" : "?"}connection_limit=${process.env.DB_POOL_SIZE ?? "4"}`
    : databaseUrl;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(pooledUrl ? { datasourceUrl: pooledUrl } : {}),
    // Remote pooled Postgres: interactive transactions need more than the 5s default.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export all Prisma types
export * from "@prisma/client";
export * from "./notifications";
export { PrismaClient };
export * from "./escrow-channels";
export * from "./reputation";

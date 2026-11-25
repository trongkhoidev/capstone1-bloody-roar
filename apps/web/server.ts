// apps/web/server.ts
// =============================================================================
// Bloody-Roar — Next.js Custom Server
// Attaches: GraphQL Yoga + Socket.io
// =============================================================================

import "./src/lib/env";
import "./src/lib/config/env";

import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { parse } from "node:url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketHandlers } from "./src/socket/handlers";
import { startEscrowBridge } from "./src/lib/realtime/escrow-bridge";
import { logger } from "./src/lib/logger";
import { assertChainConfig, defaultLocalManifestPath } from "@bloody-roar/shared/chain-guard";
import { tokenFromCookieHeader, verifyJWT } from "./src/lib/auth";
import { authUri } from "./src/lib/auth/siwe";

const dev = process.env.NODE_ENV !== "production";
// Containers (Railway/Docker) set HOSTNAME to the container id, so never use it to bind.
const hostname = process.env.BIND_HOST || (dev ? "localhost" : "0.0.0.0");

const defaultPort = process.argv.includes("--local") ? 4010 : 4000;
const port = Number(process.env.PORT || defaultPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
const appUrl = authUri(configuredAppUrl);
process.env.NEXT_PUBLIC_APP_URL = configuredAppUrl;

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// GraphQL is now handled by Next.js App Router API routes (/api/graphql/route.ts)

app.prepare().then(async () => {
  const notifications = new EventEmitter();
  notifications.setMaxListeners(0);
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    const { pathname } = parsedUrl;

    if (pathname === "/api/notifications/events" && req.method === "GET") {
      const token = tokenFromCookieHeader(req.headers.cookie ?? null);
      const user = token ? await verifyJWT(token) : null;
      if (!user) { res.writeHead(401); res.end(); return; }
      if (res.destroyed) return;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      res.write(": connected\n\n");
      const send = () => res.write("event: notification\ndata: {}\n\n");
      notifications.on(user.id, send);
      notifications.on("*", send);
      const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25_000);
      const revalidate = setInterval(() => { void verifyJWT(token!).then((current) => { if (!current || current.id !== user.id) res.end(); }); }, 5 * 60_000);
      res.on("close", () => { clearInterval(heartbeat); clearInterval(revalidate); notifications.off(user.id, send); notifications.off("*", send); });
      return;
    }

// GraphQL requests will pass through to Next.js handler below

    // Health check endpoint
    if (pathname === "/api/health") {
      try {
        const { prisma } = await import("@bloody-roar/database");
        await prisma.$queryRaw`SELECT 1`;
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ status: "ok", database: "connected", timestamp: new Date().toISOString() }));
      } catch (error) {
        logger.error({ error }, "Database health check failed");
        res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ status: "error", database: "disconnected", timestamp: new Date().toISOString() }));
      }
      return;
    }

    // All other requests go to Next.js
    return handle(req, res, parsedUrl);
  });

  // Attach Socket.io to the HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: dev ? [appUrl, `http://localhost:${port}`, `http://127.0.0.1:${port}`] : [appUrl],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 256 * 1024,
  });

  // Register all Socket.io event handlers
  registerSocketHandlers(io);
  startEscrowBridge(io, (userId) => notifications.emit(userId));

  // Make io instance available globally (for use in GraphQL resolvers)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).__socketIO = io;

  // io.close() also closes the HTTP server; its callback runs once the last connection ends.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    setTimeout(() => process.exit(1), 10_000).unref();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    const { prisma } = await import("@bloody-roar/database");
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Check the configured chain before serving: a wrong RPC, chain ID, or escrow address would mislabel every action.
  const escrowAddress = process.env.ESCROW_ADDRESS;
  if (escrowAddress) {
    await assertChainConfig({
      rpcUrl: process.env.RPC_URL ?? "",
      chainId: Number(process.env.CHAIN_ID),
      escrowAddress,
      manifestPath: defaultLocalManifestPath(),
    }).catch((error: unknown) => {
      logger.fatal({ error: error instanceof Error ? error.message : String(error) }, "chain configuration check failed");
      process.exit(1);
    });
  } else if (!dev && process.env.ESCROW_OPTIONAL !== "1") {
    // ESCROW_OPTIONAL=1 lets CI run chain-free e2e against a production build.
    logger.fatal({}, "ESCROW_ADDRESS is required in production");
    process.exit(1);
  } else {
    logger.warn({}, "ESCROW_ADDRESS is not set; escrow actions are disabled");
  }

  httpServer.listen(port, hostname, () => {
    logger.info(
      {
        mode: dev ? "development" : "production",
        url: appUrl,
        graphql: `${appUrl}/api/graphql`,
      },
      `🩸 Bloody-Roar server started`
    );
    // Dev compiles routes on first request; pre-compile them in the background so the first click is fast.
    if (dev && process.env.WARM_ROUTES !== "0") {
      void (async () => {
        for (const route of ["/", "/marketplace", "/dashboard", "/issues/create", "/guide", "/profile", "/messages", "/admin"]) {
          await fetch(`http://localhost:${port}${route}`, { redirect: "manual" }).catch(() => undefined);
        }
        try {
          const response = await fetch(`http://localhost:${port}/api/graphql`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "{ issues(first: 1) { edges { node { id } } } }" }),
          });
          if (!response.ok) return;
          const body = await response.json() as { data?: { issues?: { edges: Array<{ node: { id: string } }> } } };
          const issueId = body.data?.issues?.edges[0]?.node.id;
          if (issueId) await fetch(`http://localhost:${port}/issues/${encodeURIComponent(issueId)}`, { redirect: "manual" });
        } catch {
        }
      })();
    }
  });
});

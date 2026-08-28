// apps/web/server.ts
// =============================================================================
// Bloody-Roar — Next.js Custom Server
// Attaches: GraphQL Yoga + Socket.io
// =============================================================================

import "./src/lib/env";

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { registerSocketHandlers } from "./src/socket/handlers";
import { logger } from "./src/lib/logger";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// GraphQL is now handled by Next.js App Router API routes (/api/graphql/route.ts)

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    const { pathname } = parsedUrl;

// GraphQL requests will pass through to Next.js handler below

    // Health check endpoint
    if (pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    // All other requests go to Next.js
    return handle(req, res, parsedUrl);
  });

  // Attach Socket.io to the HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: dev ? ["http://localhost:3000"] : [process.env.NEXT_PUBLIC_APP_URL!],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Register all Socket.io event handlers
  registerSocketHandlers(io);

  // Make io instance available globally (for use in GraphQL resolvers)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).__socketIO = io;

  httpServer.listen(port, () => {
    logger.info(
      {
        mode: dev ? "development" : "production",
        url: `http://${hostname}:${port}`,
        graphql: `http://${hostname}:${port}/api/graphql`,
      },
      `🩸 Bloody-Roar server started`
    );
  });
});

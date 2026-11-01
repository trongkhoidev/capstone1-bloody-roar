// Relays worker LISTEN/NOTIFY events to Socket.IO clients (BE-59b).
import { Client } from "pg";
import type { Server } from "socket.io";
import { NOTIFICATION_CREATED_CHANNEL, PROJECTION_CHANGED_CHANNEL } from "@bloody-roar/database";
import { createLogger } from "../logger";

const log = createLogger("escrow-bridge");
const RECONNECT_MS = 5_000;

export function routeNotification(io: Server, channel: string, rawPayload: string): void {
  const payload = JSON.parse(rawPayload) as Record<string, unknown>;
  if (channel === PROJECTION_CHANGED_CHANNEL && typeof payload.issueId === "string") {
    io.to(`task:${payload.issueId}`).emit("escrow:invalidate", {
      escrowId: payload.escrowId,
      projectionVersion: payload.projectionVersion,
    });
  } else if (channel === NOTIFICATION_CREATED_CHANNEL && typeof payload.userId === "string") {
    io.to(`user:${payload.userId}`).emit("notification:new", { id: payload.id });
  }
}

// LISTEN needs a session, so it uses DIRECT_URL. A transaction-pooled URL drops LISTEN.
export function startEscrowBridge(io: Server): void {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    log.warn("no DIRECT_URL or DATABASE_URL; realtime escrow events are off");
    return;
  }

  const connect = () => {
    const client = new Client({ connectionString });
    let retrying = false;
    const retry = (err: unknown) => {
      if (retrying) return;
      retrying = true;
      log.error({ err }, "escrow bridge lost its connection; retrying");
      client.end().catch(() => undefined);
      setTimeout(connect, RECONNECT_MS);
    };

    client.on("error", retry);
    client.on("notification", (msg) => {
      try {
        routeNotification(io, msg.channel, msg.payload ?? "{}");
      } catch (err) {
        log.error({ err, channel: msg.channel }, "bad escrow notification payload");
      }
    });
    client
      .connect()
      .then(() => client.query(`LISTEN ${PROJECTION_CHANGED_CHANNEL}`))
      .then(() => client.query(`LISTEN ${NOTIFICATION_CREATED_CHANNEL}`))
      .catch(retry);
  };

  connect();
}

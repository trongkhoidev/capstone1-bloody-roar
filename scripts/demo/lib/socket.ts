// @ts-ignore
import { io, type Socket } from "../../../apps/web/node_modules/socket.io-client";

export type { Socket };

export async function connectDemoSocket(
  cookie: string,
  ip?: string,
  baseUrl = "http://localhost:4100"
): Promise<Socket> {
  const token = cookie.includes("=") ? cookie.slice(cookie.indexOf("=") + 1) : cookie;
  const extraHeaders: Record<string, string> = {};
  if (ip) extraHeaders["x-forwarded-for"] = ip;

  const socket = (io as unknown as (url: string, opts: unknown) => Socket)(baseUrl, {
    auth: { token },
    extraHeaders,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connect timeout (10s)"));
    }, 10_000);
    (socket as unknown as { once: (ev: string, fn: (err?: unknown) => void) => void }).once(
      "connect",
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
    (socket as unknown as { once: (ev: string, fn: (err?: unknown) => void) => void }).once(
      "connect_error",
      (err?: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

  return socket;
}

export function emitAck<T = unknown>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ack for ${event} within 10000ms`)), 10_000);
    socket.emit(event, ...args, (result: T) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

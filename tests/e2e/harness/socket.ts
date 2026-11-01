// socket.io-client is installed for apps/web only (not hoisted), so the harness reads that copy without adding a dependency.
import { io, type Socket } from "../../../apps/web/node_modules/socket.io-client";

export type { Socket };

// Opens a socket as the user behind a login cookie; the handshake verifies the same JWT the cookie carries.
export async function connectSocket(cookie: string): Promise<Socket> {
  const token = cookie.slice(cookie.indexOf("=") + 1);
  const socket = io("http://localhost:4012", { auth: { token }, transports: ["websocket"], forceNew: true, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

// Emits with an acknowledgement; resolves with what the server passed to its callback (undefined on success).
// Rejects after the timeout, since a server that disconnects the socket never calls back.
export function ack<T = unknown>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ack for ${event} within 10000ms`)), 10_000);
    socket.emit(event, ...args, (result: T) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

// Resolves with the next payload of an event, or rejects when none arrives in time.
export function nextEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`No ${event} within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, onEvent);
  });
}

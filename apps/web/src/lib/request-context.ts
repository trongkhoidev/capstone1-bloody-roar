// apps/web/src/lib/request-context.ts
// Request id carried through async work, so every log line of one request shares it.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage<{ requestId: string }>();

// The header is client-supplied, so only short, plain tokens are kept.
export function requestIdFrom(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
}

export function withRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

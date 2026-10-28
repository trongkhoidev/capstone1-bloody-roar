import pino from "pino";
import { describe, expect, it } from "vitest";
import { logMixin } from "../lib/logger";
import { currentRequestId, requestIdFrom, withRequestId } from "../lib/request-context";

describe("request context", () => {
  it("keeps a well-formed incoming x-request-id", () => {
    const request = new Request("http://localhost/api", { headers: { "x-request-id": "req-42" } });
    expect(requestIdFrom(request)).toBe("req-42");
  });

  it("replaces a malformed incoming id with a generated one", () => {
    const request = new Request("http://localhost/api", { headers: { "x-request-id": "bad id!" } });
    expect(requestIdFrom(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("exposes the id only inside the request, across async work", async () => {
    const seen = await withRequestId("req-1", async () => {
      await Promise.resolve();
      return currentRequestId();
    });
    expect(seen).toBe("req-1");
    expect(currentRequestId()).toBeUndefined();
  });

  it("puts the request id on log lines written inside the request only", () => {
    const lines: string[] = [];
    const log = pino({ mixin: logMixin }, { write: (line: string) => void lines.push(line) });

    withRequestId("req-7", () => log.info("inside"));
    log.info("outside");

    const records = lines.map((line) => JSON.parse(line) as { requestId?: string });
    expect(records[0]?.requestId).toBe("req-7");
    expect(records[1]?.requestId).toBeUndefined();
  });
});

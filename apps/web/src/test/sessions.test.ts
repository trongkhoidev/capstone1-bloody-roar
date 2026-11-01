import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const user = { id: "user-1", role: "CLIENT", name: null, isBanned: false };
const token = "current-jwt";
const currentHash = createHash("sha256").update(token).digest("hex");
const sessionRows = [
  { id: "s-current", refreshHash: currentHash, userAgent: "Chrome", ip: "10.0.0.1", createdAt: new Date("2031-01-02"), expiresAt: new Date("2031-02-01") },
  { id: "s-other", refreshHash: "other-hash", userAgent: "Safari", ip: "10.0.0.2", createdAt: new Date("2031-01-01"), expiresAt: new Date("2031-02-01") },
];

function fakeDb() {
  return {
    session: {
      findMany: vi.fn().mockResolvedValue(sessionRows),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const LIST = `query { mySessions { id current userAgent } }`;

describe("sessions", () => {
  it("lists the caller's live sessions and marks the one this request uses", async () => {
    const db = fakeDb();
    const result = await execute(LIST, { user, db, sessionToken: token }, {});

    expect(result.errors).toBeUndefined();
    expect(result.data?.mySessions).toEqual([
      { id: "s-current", current: true, userAgent: "Chrome" },
      { id: "s-other", current: false, userAgent: "Safari" },
    ]);
    expect(db.session.findMany.mock.calls[0]?.[0].where).toMatchObject({ userId: "user-1", revokedAt: null });
    expect(JSON.stringify(result.data)).not.toContain(currentHash);
  });

  it("revokes only the caller's own session", async () => {
    const db = fakeDb();
    const result = await execute(`mutation($id: ID!) { revokeSession(id: $id) }`, { user, db }, { id: "s-other" });

    expect(result.errors).toBeUndefined();
    expect(db.session.updateMany.mock.calls[0]?.[0].where).toMatchObject({ id: "s-other", userId: "user-1", revokedAt: null });
  });

  it("reports a session that is not the caller's as not found", async () => {
    const db = fakeDb();
    db.session.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await execute(`mutation($id: ID!) { revokeSession(id: $id) }`, { user, db }, { id: "someone-elses" });
    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });

  it("revokes every other session, keeps the current one, and returns the count", async () => {
    const db = fakeDb();
    db.session.updateMany.mockResolvedValueOnce({ count: 3 });
    const result = await execute(`mutation { revokeOtherSessions }`, { user, db, sessionToken: token }, {});

    expect(result.data?.revokeOtherSessions).toBe(3);
    expect(db.session.updateMany.mock.calls[0]?.[0].where).toMatchObject({ userId: "user-1", revokedAt: null, refreshHash: { not: currentHash } });
  });

  it("refuses session management to unauthenticated callers", async () => {
    const result = await execute(LIST, { user: null, db: fakeDb() }, {});
    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHORIZED");
  });
});

import { describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };
const client = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };

// Calls a root field resolver directly; the GraphQL engine instance differs between test and schema modules.
function callQuery(name: string, args: Record<string, unknown>, user: unknown, db: unknown) {
  const field = schema.getQueryType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`no resolver for ${name}`);
  return field.resolve({} as never, args, { db, user } as never, {} as never);
}

type FindArgs = { where?: unknown; take?: number; cursor?: unknown; skip?: number };

describe("aiLogs (AI-13)", () => {
  it("returns the newest logs for an admin, filtered by task", async () => {
    const row = { id: "log-1", task: "GUARD", createdAt: new Date() };
    const db = { aILog: { findMany: vi.fn((_args: FindArgs) => Promise.resolve([row])) } };

    await expect(callQuery("aiLogs", { task: "GUARD" }, admin, db)).resolves.toEqual([row]);
    expect(db.aILog.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { task: "GUARD" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
  });

  it("pages from a cursor", async () => {
    const db = { aILog: { findMany: vi.fn((_args: FindArgs) => Promise.resolve([])) } };

    await callQuery("aiLogs", { after: "log-9", first: 20 }, admin, db);

    expect(db.aILog.findMany.mock.calls[0]?.[0]).toMatchObject({ where: {}, cursor: { id: "log-9" }, skip: 1, take: 20 });
  });

  it("refuses non-admin callers without querying", () => {
    const db = { aILog: { findMany: vi.fn((_args: FindArgs) => Promise.resolve([])) } };

    expect(() => callQuery("aiLogs", {}, client, db)).toThrow("Admin access required");
    expect(db.aILog.findMany).not.toHaveBeenCalled();
  });
});

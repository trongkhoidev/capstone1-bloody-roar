import { describe, expect, it, vi } from "vitest";
import { callQuery } from "./helpers/call-query";
import { client } from "./helpers/users";

const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };
const issueRow = { id: "issue-1", title: "Parser for logs", status: "DISPUTED" };
const logRow = { id: "log-2", action: "ban_user", details: { reason: "spam" } };


function fakeDb() {
  return {
    issue: { findMany: vi.fn((_args: { where?: unknown }) => Promise.resolve([issueRow])) },
    adminLog: {
      findMany: vi.fn((_args: { cursor?: unknown; skip?: number; take?: number; orderBy?: unknown }) =>
        Promise.resolve([logRow]),
      ),
    },
  };
}

describe("admin queries", () => {
  it("lists issues filtered by status and title for an admin", async () => {
    const db = fakeDb();

    await expect(callQuery("adminIssues", { status: "DISPUTED", search: " parser " }, admin, db))
      .resolves.toEqual([issueRow]);
    expect(db.issue.findMany.mock.calls[0]?.[0].where).toEqual({
      status: "DISPUTED",
      title: { contains: "parser", mode: "insensitive" },
    });
  });

  it("rejects an unknown issue status before querying", () => {
    const db = fakeDb();

    expect(() => callQuery("adminIssues", { status: "NOPE" }, admin, db)).toThrow();
    expect(db.issue.findMany).not.toHaveBeenCalled();
  });

  it("pages audit logs from a cursor, newest first", async () => {
    const db = fakeDb();

    await expect(callQuery("adminLogs", { after: "log-3", first: 10 }, admin, db)).resolves.toEqual([logRow]);
    expect(db.adminLog.findMany.mock.calls[0]?.[0]).toMatchObject({
      cursor: { id: "log-3" },
      skip: 1,
      take: 10,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("refuses both queries to a non-admin user", () => {
    const db = fakeDb();

    expect(() => callQuery("adminLogs", {}, client, db)).toThrow("Admin access required");
    expect(() => callQuery("adminIssues", {}, client, db)).toThrow("Admin access required");
    expect(db.adminLog.findMany).not.toHaveBeenCalled();
  });
});

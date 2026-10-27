import { describe, expect, it, vi } from "vitest";
// CJS entry: the same graphql instance that Pothos loads, so schema execution works in tests.
import { graphql } from "graphql/index.js";
import { schema } from "../graphql/schema";

const user = { id: "user-1", role: "CLIENT", walletAddress: "0xuser" };
const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };

type FindArgs = { where?: unknown; take?: number; cursor?: unknown; skip?: number };
const findMany = () => vi.fn((_args: FindArgs) => Promise.resolve([] as unknown[]));

describe("cursor pagination (BE-21)", () => {
  it("pages notifications after a cursor, scoped to the viewer", async () => {
    const db = { notification: { findMany: findMany() } };

    const result = await graphql({
      schema,
      source: `query { notifications(after: "n-5", first: 10) { id } }`,
      contextValue: { db, user },
    });

    expect(result.errors).toBeUndefined();
    expect(db.notification.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { userId: "user-1" },
      cursor: { id: "n-5" },
      skip: 1,
      take: 10,
    });
  });

  it("pages admin users after a cursor", async () => {
    const db = { user: { findMany: findMany() } };

    const result = await graphql({
      schema,
      source: `query { adminUsers(after: "u-3") { id } }`,
      contextValue: { db, user: admin },
    });

    expect(result.errors).toBeUndefined();
    expect(db.user.findMany.mock.calls[0]?.[0]).toMatchObject({ cursor: { id: "u-3" }, skip: 1, take: 50 });
  });

  it("caps admin dispute pages at 100 and pages from a cursor", async () => {
    const db = { dispute: { findMany: findMany() } };

    const capped = await graphql({
      schema,
      source: `query { adminDisputes(first: 500) { id } }`,
      contextValue: { db, user: admin },
    });
    expect(capped.errors).toBeUndefined();
    expect(db.dispute.findMany.mock.calls[0]?.[0]).toMatchObject({ take: 100 });
    expect(db.dispute.findMany.mock.calls[0]?.[0]).not.toHaveProperty("cursor");

    const paged = await graphql({
      schema,
      source: `query { adminDisputes(after: "d-9") { id } }`,
      contextValue: { db, user: admin },
    });
    expect(paged.errors).toBeUndefined();
    expect(db.dispute.findMany.mock.calls[1]?.[0]).toMatchObject({ cursor: { id: "d-9" }, skip: 1, take: 50 });
  });
});

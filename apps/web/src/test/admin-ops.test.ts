import { describe, expect, it, vi } from "vitest";
import { callQuery } from "./helpers/call-query";
import { client } from "./helpers/users";

const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };
const checkpoint = { chainId: 31337, contractAddress: "0xescrow", lastScannedBlock: 12n, lastCanonicalBlockHash: "0xhash", updatedAt: new Date() };
const finding = { id: "finding-1", escrowIdHash: "0xkey", kind: "chain:31337:0xescrow:amount", expected: {}, actual: {}, blockNumber: 12n, resolvedAt: null, createdAt: new Date() };
const intent = { id: "intent-1", status: "SUBMITTED", submittedAt: new Date(Date.now() - 3_600_000) };
const config = { chainId: 31337, contractAddress: "0xescrow", paused: false, owner: "0xowner", arbiter: "0xarbiter", feeRecipient: "0xfee" };


// Returns the GraphQL error code a call throws, or undefined when it does not throw.
function codeOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return (error as { extensions?: { code?: string } }).extensions?.code;
  }
  return undefined;
}

function fakeDb() {
  return {
    projectionCheckpoint: { findMany: vi.fn((_args?: { orderBy?: unknown }) => Promise.resolve([checkpoint])) },
    reconciliationFinding: { findMany: vi.fn((_args?: Record<string, unknown>) => Promise.resolve([finding])) },
    transactionIntent: { findMany: vi.fn((_args?: { where?: unknown }) => Promise.resolve([intent])) },
    contractConfig: { findMany: vi.fn((_args?: { orderBy?: unknown }) => Promise.resolve([config])) },
  };
}

describe("admin ops queries", () => {
  it("returns indexer checkpoints, contract config and open reconciliation findings to an admin", async () => {
    const db = fakeDb();

    await expect(callQuery("indexerStatus", {}, admin, db)).resolves.toEqual([checkpoint]);
    await expect(callQuery("contractConfig", {}, admin, db)).resolves.toEqual([config]);
    await expect(callQuery("reconciliationFindings", {}, admin, db)).resolves.toEqual([finding]);
    expect(db.reconciliationFinding.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { resolvedAt: null }, take: 20 });
  });

  it("filters findings by resolved status and pages from a cursor", async () => {
    const db = fakeDb();

    await callQuery("reconciliationFindings", { status: "RESOLVED", first: 5, after: "finding-0" }, admin, db);
    expect(db.reconciliationFinding.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { resolvedAt: { not: null } },
      take: 5,
      cursor: { id: "finding-0" },
      skip: 1,
    });
  });

  it("rejects an unknown finding status before querying", () => {
    const db = fakeDb();

    expect(codeOf(() => callQuery("reconciliationFindings", { status: "NOPE" }, admin, db))).toBe("BAD_USER_INPUT");
    expect(db.reconciliationFinding.findMany).not.toHaveBeenCalled();
  });

  it("lists only submitted intents older than thirty minutes", async () => {
    const db = fakeDb();

    await expect(callQuery("stuckIntents", {}, admin, db)).resolves.toEqual([intent]);
    const where = db.transactionIntent.findMany.mock.calls[0]![0]!.where as { status: { in: string[] }; submittedAt: { lt: Date } };
    expect(where.status.in).toEqual(["SUBMITTED", "PENDING_SAFE_HEAD"]);
    expect(where.submittedAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 30 * 60_000);
    expect(where.submittedAt.lt.getTime()).toBeGreaterThan(Date.now() - 31 * 60_000);
  });

  it("refuses every ops query to a non-admin user", () => {
    const db = fakeDb();

    for (const name of ["indexerStatus", "reconciliationFindings", "stuckIntents", "contractConfig"]) {
      expect(codeOf(() => callQuery(name, {}, client, db))).toBe("FORBIDDEN");
    }
    expect(db.projectionCheckpoint.findMany).not.toHaveBeenCalled();
    expect(db.reconciliationFinding.findMany).not.toHaveBeenCalled();
    expect(db.transactionIntent.findMany).not.toHaveBeenCalled();
    expect(db.contractConfig.findMany).not.toHaveBeenCalled();
  });
});

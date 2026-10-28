import { describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };
const client = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };

// Calls a mutation resolver directly; the GraphQL engine instance differs between test and schema modules.
function callMutation(name: string, args: Record<string, unknown>, user: unknown, db: unknown) {
  const field = schema.getMutationType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`no resolver for ${name}`);
  return field.resolve({} as never, args, { db, user } as never, {} as never);
}

function fakeDb(target: { id: string; role: string }) {
  const tx = {
    user: {
      findUnique: vi.fn((_args: unknown) => Promise.resolve(target)),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
    },
    session: { updateMany: vi.fn((_args: unknown) => Promise.resolve({ count: 0 })) },
    issue: {
      findMany: vi.fn((_args: unknown) => Promise.resolve([{ id: "issue-1" }])),
      updateMany: vi.fn((_args: unknown) => Promise.resolve({ count: 1 })),
    },
    application: { updateMany: vi.fn((_args: unknown) => Promise.resolve({ count: 2 })) },
    adminLog: { create: vi.fn((_args: { data: Record<string, unknown> }) => Promise.resolve({})) },
  };
  const db = { ...tx, $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
  return { db, tx };
}

describe("admin role changes (BE-66a)", () => {
  it("changes a user's role and records the change in AdminLog", async () => {
    const { db, tx } = fakeDb({ id: "user-2", role: "DEVELOPER" });

    await callMutation("setUserRole", { userId: "user-2", role: "CLIENT" }, admin, db);

    expect(tx.user.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: "user-2" }, data: { role: "CLIENT" } });
    expect(tx.adminLog.create.mock.calls[0]?.[0].data).toMatchObject({
      action: "set_user_role",
      targetId: "user-2",
      details: { from: "DEVELOPER", to: "CLIENT" },
    });
  });

  it("refuses to demote the admin who is making the change", async () => {
    const { db } = fakeDb({ id: "admin-1", role: "ADMIN" });

    await expect(callMutation("setUserRole", { userId: "admin-1", role: "CLIENT" }, admin, db)).rejects.toThrow(
      "Không thể tự hạ quyền quản trị viên",
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses non-admin callers", async () => {
    const { db } = fakeDb({ id: "user-2", role: "DEVELOPER" });

    await expect(callMutation("setUserRole", { userId: "user-2", role: "ADMIN" }, client, db)).rejects.toThrow(
      "Admin access required",
    );
  });
});

describe("ban cascade (BE-13)", () => {
  it("cancels the banned client's open tasks and rejects pending applications on them and by the user", async () => {
    const { db, tx } = fakeDb({ id: "client-1", role: "CLIENT" });

    await callMutation("banUser", { input: { userId: "client-1", reason: "spam posting" } }, admin, db);

    expect(tx.issue.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { clientId: "client-1", status: "OPEN" },
    });
    expect(tx.issue.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { in: ["issue-1"] } },
      data: { status: "CANCELLED" },
    });
    expect(tx.application.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        status: "PENDING",
        OR: [{ developerId: "client-1" }, { issueId: { in: ["issue-1"] } }],
      },
      data: { status: "REJECTED" },
    });
    expect(tx.adminLog.create.mock.calls[0]?.[0].data).toMatchObject({ action: "ban_user", targetId: "client-1" });
  });
});

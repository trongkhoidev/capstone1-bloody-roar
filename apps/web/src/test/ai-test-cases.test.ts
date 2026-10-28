import { describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const client = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };
const other = { id: "dev-2", role: "DEVELOPER", walletAddress: "0xother" };
const input = {
  issueId: "issue-1",
  title: "Login rejects bad password",
  description: "A wrong password shows an error and does not sign in.",
  given: "a registered user",
  when: "they submit a wrong password",
  then: "they see an error and stay signed out",
};

// Calls a mutation resolver directly; the GraphQL engine instance differs between test and schema modules.
function callMutation(name: string, args: Record<string, unknown>, user: unknown, db: unknown) {
  const field = schema.getMutationType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`no resolver for ${name}`);
  return field.resolve({} as never, args, { db, user } as never, {} as never);
}

function fakeDb({ status = "OPEN", clientId = client.id }: { status?: string; clientId?: string } = {}) {
  const issue = { clientId, status };
  return {
    issue: { findUnique: vi.fn(async () => issue) },
    testCase: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "tc-1", ...data })),
      findUnique: vi.fn(async () => ({ id: "tc-1", issue })),
      delete: vi.fn(async () => ({ id: "tc-1" })),
    },
  };
}

describe("manual acceptance criteria", () => {
  it("lets the task owner add an unapproved MANUAL criterion while the task is open", async () => {
    const db = fakeDb();

    await callMutation("createTestCase", { input }, client, db);

    expect(db.testCase.create.mock.calls[0]?.[0].data).toMatchObject({
      issueId: "issue-1",
      source: "MANUAL",
      isApproved: false,
      priority: "NORMAL",
      isEdgeCase: false,
    });
  });

  it("refuses to add criteria for someone else's task", async () => {
    const db = fakeDb();

    await expect(callMutation("createTestCase", { input }, other, db)).rejects.toThrow(
      "Only the task owner can review acceptance criteria",
    );
    expect(db.testCase.create).not.toHaveBeenCalled();
  });

  it("locks criteria once the task has been assigned", async () => {
    const db = fakeDb({ status: "IN_PROGRESS" });

    await expect(callMutation("createTestCase", { input }, client, db)).rejects.toThrow(
      "Acceptance criteria are locked after assignment",
    );
    await expect(callMutation("deleteTestCase", { id: "tc-1" }, client, db)).rejects.toThrow(
      "Acceptance criteria are locked after assignment",
    );
    expect(db.testCase.create).not.toHaveBeenCalled();
    expect(db.testCase.delete).not.toHaveBeenCalled();
  });

  it("lets the task owner delete a criterion while the task is open", async () => {
    const db = fakeDb();

    await expect(callMutation("deleteTestCase", { id: "tc-1" }, client, db)).resolves.toBe(true);
    expect(db.testCase.delete).toHaveBeenCalledWith({ where: { id: "tc-1" } });
  });
});

// @vitest-environment node
// US-108: only the developer who fixed a similar COMPLETED issue may apply at the reuse price.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const APPLY = `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id reuseOfIssueId } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("reuse-price applications on test database", () => {
  const users: string[] = [];
  const issues: string[] = [];
  let tokenId = "";
  let client = "", oldDev = "", otherDev = "";
  let solved = "", unfinished = "", unlinked = "", target = "";

  const user = async (role: "CLIENT" | "DEVELOPER") => {
    const created = await prisma.user.create({ data: { walletAddress: hex(20), role } });
    users.push(created.id);
    return created.id;
  };
  const issue = async (data: { clientId: string; status?: "OPEN" | "COMPLETED" | "IN_PROGRESS"; developerId?: string }) => {
    const created = await prisma.issue.create({ data: { title: "Fix login", description: "Login spins forever.", category: "BUG_FIX", tokenId, bountyAmount: "100", status: "OPEN", ...data } });
    issues.push(created.id);
    return created.id;
  };
  const apply = (developerId: string, reuseOfIssueId: string) =>
    execute(APPLY, { user: { id: developerId, role: "DEVELOPER", isBanned: false }, db: prisma }, { input: { issueId: target, reuseOfIssueId } });

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    tokenId = (await prisma.token.create({ data: { name: "Reuse", symbol: "RSE", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    [client, oldDev, otherDev] = [await user("CLIENT"), await user("DEVELOPER"), await user("DEVELOPER")];
    const oldClient = await user("CLIENT");
    solved = await issue({ clientId: oldClient, status: "COMPLETED", developerId: oldDev });
    unfinished = await issue({ clientId: oldClient, status: "IN_PROGRESS", developerId: oldDev });
    unlinked = await issue({ clientId: oldClient, status: "COMPLETED", developerId: oldDev });
    target = await issue({ clientId: client });
    await prisma.issueSimilarity.createMany({ data: [
      { issueId: target, similarIssueId: solved, developerId: oldDev, score: 0.9 },
      { issueId: target, similarIssueId: unfinished, developerId: oldDev, score: 0.9 },
    ] });
  }, 60_000);
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.application.deleteMany({ where: { issueId: { in: issues } } });
    await prisma.issue.deleteMany({ where: { id: { in: issues } } });
    await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }, 60_000);

  it("rejects a developer who did not fix the reused issue", async () => {
    expect((await apply(otherDev, solved)).errors?.[0]?.extensions?.code).toBe("REUSE_NOT_ALLOWED");
  });

  it("rejects a reused issue that is not COMPLETED", async () => {
    expect((await apply(oldDev, unfinished)).errors?.[0]?.extensions?.code).toBe("REUSE_NOT_ALLOWED");
  });

  it("rejects a reused issue with no similarity row for this bounty", async () => {
    expect((await apply(oldDev, unlinked)).errors?.[0]?.extensions?.code).toBe("REUSE_NOT_ALLOWED");
  });

  it("accepts the developer who fixed the similar completed issue", async () => {
    const result = await apply(oldDev, solved);
    expect(result.errors).toBeUndefined();
    expect(result.data?.applyToIssue).toMatchObject({ reuseOfIssueId: solved });
    expect(await prisma.application.count({ where: { issueId: target } })).toBe(1);
  });
});

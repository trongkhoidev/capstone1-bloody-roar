// @vitest-environment node
// US-159: the top-matched old developer gets a 48-hour priority window before anyone else can apply.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const HOUR = 3_600_000;
const APPLY = `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id reuseOfIssueId } }`;
const DECLINE = `mutation($issueId: ID!) { declineReuseOffer(issueId: $issueId) }`;
const REJECT = `mutation($id: ID!) { rejectApplication(id: $id) { status } }`;
const CAPS = `query($id: ID!) { issue(id: $id) { viewerCapabilities { canApply canDeclineReuseOffer reuseOfferUntil } } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("reuse offer window on test database", () => {
  const users: string[] = [];
  const issues: string[] = [];
  let tokenId = "", oldClient = "", client = "", oldDev = "", otherDev = "", solved = "";

  const user = async (role: "CLIENT" | "DEVELOPER") => {
    const created = await prisma.user.create({ data: { walletAddress: hex(20), role } });
    users.push(created.id);
    return created.id;
  };
  const issue = async (data: { clientId: string; status?: "OPEN" | "COMPLETED"; developerId?: string }) => {
    const created = await prisma.issue.create({ data: { title: "Fix login", description: "Login spins forever.", category: "BUG_FIX", tokenId, bountyAmount: "100", status: "OPEN", ...data } });
    issues.push(created.id);
    return created.id;
  };
  const offered = async (offerExpiresAt: Date) => {
    const target = await issue({ clientId: client });
    await prisma.issueSimilarity.create({ data: { issueId: target, similarIssueId: solved, developerId: oldDev, score: 0.9, offerExpiresAt } });
    return target;
  };
  const as = (id: string, role = "DEVELOPER") => ({ user: { id, role, isBanned: false, walletAddress: hex(20) }, db: prisma });
  const apply = (developerId: string, issueId: string, reuseOfIssueId?: string) =>
    execute(APPLY, as(developerId), { input: { issueId, ...(reuseOfIssueId ? { reuseOfIssueId } : {}) } });
  const caps = async (viewer: string, id: string) => ((await execute(CAPS, as(viewer), { id })).data?.issue as { viewerCapabilities: Record<string, unknown> }).viewerCapabilities;

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    tokenId = (await prisma.token.create({ data: { name: "Offer", symbol: "OFR", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    [oldClient, client, oldDev, otherDev] = [await user("CLIENT"), await user("CLIENT"), await user("DEVELOPER"), await user("DEVELOPER")];
    solved = await issue({ clientId: oldClient, status: "COMPLETED", developerId: oldDev });
  }, 60_000);
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.application.deleteMany({ where: { issueId: { in: issues } } });
    await prisma.issue.deleteMany({ where: { id: { in: issues } } });
    await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }, 60_000);

  it("blocks other developers while the offer is open and lets the invited developer apply at the reuse price", async () => {
    const until = new Date(Date.now() + 48 * HOUR);
    const target = await offered(until);
    expect((await apply(otherDev, target)).errors?.[0]?.extensions?.code).toBe("REUSE_OFFER_ACTIVE");
    expect(await caps(otherDev, target)).toEqual({ canApply: false, canDeclineReuseOffer: false, reuseOfferUntil: until.toISOString() });
    expect(await caps(oldDev, target)).toEqual({ canApply: true, canDeclineReuseOffer: true, reuseOfferUntil: until.toISOString() });

    const result = await apply(oldDev, target, solved);
    expect(result.errors).toBeUndefined();
    expect(result.data?.applyToIssue).toMatchObject({ reuseOfIssueId: solved });
  });

  it("opens the bounty once the invited developer declines", async () => {
    const target = await offered(new Date(Date.now() + 48 * HOUR));
    expect((await execute(DECLINE, as(otherDev), { issueId: target })).errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    expect((await execute(DECLINE, as(oldDev), { issueId: target })).data?.declineReuseOffer).toBe(true);
    expect(await caps(otherDev, target)).toMatchObject({ canApply: true, reuseOfferUntil: null });
    expect((await apply(otherDev, target)).errors).toBeUndefined();
  });

  it("opens the bounty once the offer expires", async () => {
    const target = await offered(new Date(Date.now() - 1000));
    expect(await caps(oldDev, target)).toMatchObject({ canDeclineReuseOffer: false, reuseOfferUntil: null });
    expect((await apply(otherDev, target)).errors).toBeUndefined();
  });

  it("ends the offer when the client declines the invited developer", async () => {
    const target = await offered(new Date(Date.now() + 48 * HOUR));
    const applied = await apply(oldDev, target, solved);
    const id = (applied.data?.applyToIssue as { id: string }).id;
    expect((await execute(REJECT, as(client, "CLIENT"), { id })).errors).toBeUndefined();
    expect((await apply(otherDev, target)).errors).toBeUndefined();
  });

  it("ends the offer when the invited developer withdraws", async () => {
    const target = await offered(new Date(Date.now() + 48 * HOUR));
    const applied = await apply(oldDev, target, solved);
    const id = (applied.data?.applyToIssue as { id: string }).id;
    expect((await execute(`mutation($id: ID!) { withdrawApplication(id: $id) { status } }`, as(oldDev), { id })).errors).toBeUndefined();
    expect((await apply(otherDev, target)).errors).toBeUndefined();
  });
});

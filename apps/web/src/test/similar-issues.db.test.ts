// @vitest-environment node
// US-107: candidate query, AI confirmation, notification dedupe and the viewerCapabilities label on a real test database.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared/constants";
import type { AICompletion } from "../ai/model-router";
import { aiRateLimit } from "../lib/rate-limit";
import { detectSimilarIssues, findSimilarCandidates } from "../lib/services/similar-issues";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const answer = (text: string) => vi.fn(async (_input: unknown): Promise<AICompletion> => ({ text, model: "mock", provider: "mock", latencyMs: 1, promptTokens: null, completionTokens: null, status: "SUCCESS" }));
const LOGIN_BUG = "The wallet login button spins forever after the SIWE signature on Safari because the nonce cookie is dropped.";

describe.skipIf(!process.env.TEST_DATABASE_URL)("similar issue detection on test database", () => {
  const users: string[] = [];
  const issues: string[] = [];
  let tokenId = "";
  let oldClient = "", newClient = "", oldDev = "", otherDev = "";
  let solvedId = "";

  const user = async (role: "CLIENT" | "DEVELOPER") => {
    const created = await prisma.user.create({ data: { walletAddress: hex(20), role } });
    users.push(created.id);
    return created.id;
  };
  const issue = async (data: { title: string; description: string; clientId: string; status?: "OPEN" | "COMPLETED"; developerId?: string; requiredSkills?: string[] }) => {
    const created = await prisma.issue.create({ data: { category: "BUG_FIX", tokenId, bountyAmount: "100", status: "OPEN", requiredSkills: ["react"], ...data } });
    issues.push(created.id);
    return created.id;
  };

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    tokenId = (await prisma.token.create({ data: { name: "Similar", symbol: "SIM", address: hex(20), decimals: 6, chainId: ACTIVE_CHAIN_ID } })).id;
    [oldClient, newClient, oldDev, otherDev] = [await user("CLIENT"), await user("CLIENT"), await user("DEVELOPER"), await user("DEVELOPER")];
    solvedId = await issue({ title: "Safari wallet login spins after SIWE signature", description: LOGIN_BUG, clientId: oldClient, status: "COMPLETED", developerId: oldDev });
    // Same words but excluded: same client as the new issue, no shared skill, not completed.
    await issue({ title: "Safari wallet login spins after SIWE signature", description: LOGIN_BUG, clientId: newClient, status: "COMPLETED", developerId: otherDev });
    await issue({ title: "Safari wallet login spins after SIWE signature", description: LOGIN_BUG, clientId: oldClient, status: "COMPLETED", developerId: otherDev, requiredSkills: ["rust"] });
    await issue({ title: "Safari wallet login spins after SIWE signature", description: LOGIN_BUG, clientId: oldClient });
  }, 60_000);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.aILog.deleteMany({ where: { issueId: { in: issues } } });
    await prisma.issue.deleteMany({ where: { id: { in: issues } } });
    await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }, 60_000);

  const newIssue = (title: string, description: string) => issue({ title, description, clientId: newClient });
  const notifications = () => prisma.notification.findMany({ where: { userId: { in: [oldDev, otherDev] }, type: "SIMILAR_ISSUE_POSTED" } });
  const client = () => prisma.user.findUniqueOrThrow({ where: { id: newClient } });

  it("selects only completed issues from another client with a shared skill", async () => {
    const id = await newIssue("Wallet login spins on Safari after signing", "After the SIWE signature the login button keeps spinning on Safari.");
    const found = await findSimilarCandidates(prisma, await prisma.issue.findUniqueOrThrow({ where: { id } }));
    expect(found.map((c) => c.id)).toEqual([solvedId]);
    expect(found[0]?.developerId).toBe(oldDev);
  });

  it("matches lexemes already stemmed by the English vector", async () => {
    const title = "University";
    const description = "The parties agreed at the university";
    const solved = await issue({ title, description, clientId: oldClient, status: "COMPLETED", developerId: oldDev });
    const id = await newIssue(title, description);
    const fresh = await prisma.issue.findUniqueOrThrow({ where: { id } });
    expect((await findSimilarCandidates(prisma, fresh)).map((c) => c.id)).toEqual([solved]);
    const found = await findSimilarCandidates(prisma, { ...fresh, description: "Agreed at the university" });
    expect(found.map((c) => c.id)).toEqual([solved]);
  });

  it("excludes hidden issues and issues solved by banned developers", async () => {
    const title = "Safari wallet login spins after SIWE signature";
    const bannedDev = await user("DEVELOPER");
    await prisma.user.update({ where: { id: bannedDev }, data: { isBanned: true } });
    const hidden = await issue({ title, description: LOGIN_BUG, clientId: oldClient, status: "COMPLETED", developerId: oldDev });
    await prisma.issue.update({ where: { id: hidden }, data: { hiddenAt: new Date() } });
    await issue({ title, description: LOGIN_BUG, clientId: oldClient, status: "COMPLETED", developerId: bannedDev });
    const id = await newIssue(title, LOGIN_BUG);
    const found = await findSimilarCandidates(prisma, await prisma.issue.findUniqueOrThrow({ where: { id } }));
    expect(found.map((c) => c.id)).toEqual([solvedId]);
  });

  it("uses a separate 20-call similarity quota and workload", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:4019");
    const id = await newIssue("Safari wallet login spins after SIWE signature", LOGIN_BUG);
    const actor = { id: await user("CLIENT"), role: "CLIENT" };
    const complete = answer(JSON.stringify({ matches: [] }));

    await detectSimilarIssues(prisma, id, actor, complete);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ task: "SIMILARITY" }));
    for (let i = 0; i < 10; i++) expect(() => aiRateLimit(actor)).not.toThrow();
    for (let i = 0; i < 20; i++) await detectSimilarIssues(prisma, id, actor, complete);
    expect(complete).toHaveBeenCalledTimes(20);
  });

  it("notifies the old developer once for a confirmed match and shows them the label", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:4019");
    const id = await newIssue("Wallet login spins on Safari after signing", "After the SIWE signature the login button keeps spinning on Safari.");
    const complete = answer(JSON.stringify({ matches: [{ issueId: solvedId, score: 0.92, reason: "same nonce cookie bug" }] }));
    await detectSimilarIssues(prisma, id, await client(), complete);
    await detectSimilarIssues(prisma, id, await client(), complete);
    expect(JSON.stringify(complete.mock.calls)).toContain(solvedId);

    const sent = (await notifications()).filter((n) => n.link === `/issues/${id}`);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: oldDev, dedupeKey: `similar:${id}:${solvedId}` });
    expect(sent[0]?.body).toContain("Safari wallet login spins after SIWE signature");
    expect(await prisma.issueSimilarity.count({ where: { issueId: id } })).toBe(1);

    const label = (viewer: string) => execute(`query($id: ID!) { issue(id: $id) { viewerCapabilities { similarFixIssueId } } }`,
      { user: { id: viewer, role: "DEVELOPER", isBanned: false, walletAddress: hex(20) }, db: prisma }, { id });
    expect((await label(oldDev)).data?.issue).toEqual({ viewerCapabilities: { similarFixIssueId: solvedId } });
    expect((await label(otherDev)).data?.issue).toEqual({ viewerCapabilities: { similarFixIssueId: null } });
  });

  it("sends nothing for an unrelated issue or a low score", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:4019");
    const before = (await notifications()).length;
    const unrelated = answer(JSON.stringify({ matches: [] }));
    await detectSimilarIssues(prisma, await newIssue("Add dark mode to the dashboard", "Dashboard needs a theme toggle persisted per user."), await client(), unrelated);
    expect(unrelated).not.toHaveBeenCalled();
    await detectSimilarIssues(prisma, await newIssue("Wallet login spins on Safari again", "SIWE signature login spins on Safari."), await client(),
      answer(JSON.stringify({ matches: [{ issueId: solvedId, score: 0.5, reason: "related" }] })));
    expect((await notifications()).length).toBe(before);
  });

  it("skips the suggestion when the AI fails or answers off-schema, and the bounty still publishes", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:4019");
    const before = (await notifications()).length;
    const id = await newIssue("Wallet login spins on Safari after the signature", "SIWE login spinner on Safari never stops.");
    await expect(detectSimilarIssues(prisma, id, await client(), answer('{"matches":"yes"}'))).rejects.toThrow();
    await expect(detectSimilarIssues(prisma, id, await client(), vi.fn().mockRejectedValue(new Error("provider down")))).rejects.toThrow("provider down");

    // Nothing listens on this port: the real router fails after the publish has returned.
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:9");
    const created = await execute(`mutation($input: CreateIssueInput!) { createIssue(input: $input) { id status } }`,
      { user: { ...(await client()), isBanned: false }, db: prisma },
      { input: { title: "Safari wallet login spins after SIWE", description: `${LOGIN_BUG} Reported again on a new project.`, category: "BUG_FIX", bountyAmount: "100", tokenId, requiredSkills: ["react"] } });
    expect(created.errors).toBeUndefined();
    const createdId = (created.data?.createIssue as { id: string; status: string }).id;
    issues.push(createdId);
    expect((created.data?.createIssue as { status: string }).status).toBe("OPEN");
    await vi.waitFor(async () => expect(await prisma.aILog.count({ where: { issueId: createdId, status: "ERROR" } })).toBeGreaterThan(0), { timeout: 15_000 });
    expect((await notifications()).length).toBe(before);
  }, 30_000);
});

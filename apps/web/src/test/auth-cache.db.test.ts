// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";

it.skipIf(!process.env.TEST_DATABASE_URL)("keeps sessions cached for view tracking and denies the very next request after a ban", async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  vi.stubEnv("AUTH_PRIVATE_KEY", "0x" + "1".padStart(64, "0"));
  const { issueAuthToken, thirdwebAuth } = await import("../lib/auth");
  const { POST } = await import("../app/api/graphql/route");
  const users: string[] = [];
  const signIn = async (role: "ADMIN" | "DEVELOPER") => {
    const user = await prisma.user.create({ data: { role, walletAddress: "0x" + randomBytes(20).toString("hex") } });
    users.push(user.id);
    const token = await issueAuthToken(user.walletAddress);
    await prisma.session.create({ data: { userId: user.id, refreshHash: createHash("sha256").update(token).digest("hex"), nonce: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    return { user, token };
  };
  const gql = async (token: string, query: string, variables = {}) => {
    const request = new Request("http://localhost:4000/api/graphql", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ query, variables }),
    });
    return (await POST(request, { request })).json();
  };
  const authenticate = vi.spyOn(thirdwebAuth(), "authenticate");
  let issueId: string | undefined;
  let tokenId: string | undefined;
  try {
    const admin = await signIn("ADMIN"), developer = await signIn("DEVELOPER");
    const token = await prisma.token.create({ data: { name: "Auth cache", symbol: "CACHE", address: "0x" + randomBytes(20).toString("hex"), chainId: 31337, decimals: 6 } });
    tokenId = token.id;
    const issue = await prisma.issue.create({ data: { title: "Auth cache", description: "Auth cache fixture", category: "BUG_FIX", clientId: admin.user.id, tokenId, bountyAmount: "1" } });
    issueId = issue.id;
    const mine = "{ myApplications { id } }";
    expect(await gql(developer.token, mine)).toMatchObject({ data: { myApplications: [] } });
    expect(await gql(developer.token, `mutation { recordIssueView(issueId: "${issueId}") }`)).toMatchObject({ data: { recordIssueView: true } });
    expect(await gql(developer.token, mine)).toMatchObject({ data: { myApplications: [] } });
    const callsBeforeBan = authenticate.mock.calls.filter(([token]) => token === developer.token).length;
    const result = await gql(admin.token, `mutation($input: BanUserInput!) { ...Moderate } fragment Moderate on Mutation { suspended: banUser(input: $input) { id } }`, { input: { userId: developer.user.id, reason: "Auth cache test" } });
    expect(result).toMatchObject({ data: { suspended: { id: developer.user.id } } });
    expect(await gql(developer.token, "{ me { id } }")).toMatchObject({ data: { me: null } });
    expect(callsBeforeBan).toBe(1);
  } finally {
    authenticate.mockRestore();
    if (issueId) await prisma.issue.delete({ where: { id: issueId } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    await prisma.adminLog.deleteMany({ where: { adminId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  }
}, 60_000);

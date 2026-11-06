import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund, walletOf } from "./harness/funding";
import { claimFunds, claimable, feeUser, tokenBalance } from "./harness/payout";
import { ack, connectSocket, nextEvent } from "./harness/socket";
import { login } from "./harness/wallet";
import { releaseFunds, submitWork } from "./harness/work";

beforeAll(() => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  if (process.env.E2E_USE_HTTP_AUTH !== "true") throw new Error("Set E2E_USE_HTTP_AUTH=true to test real authenticated HTTP requests");
});

test("SIWE sessions drive issue creation through chat, submission, release and claim", async () => {
  const f = await fixture();
  const fee = await feeUser(f);
  for (const user of [f.developer, fee]) if ((await claimable(f.prisma, user.walletAddress)) > 0n) await claimFunds(f, user);
  await fund(f);
  const client = await connectSocket((await login(walletOf(f, f.client))).cookie);
  const developer = await connectSocket((await login(walletOf(f, f.developer))).cookie);
  try {
    expect(await ack(client, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(developer, "task:join", f.issueId)).toBeUndefined();
    const delivered = nextEvent<{ content: string }>(developer, "message:new");
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Confirming the agreed scope", type: "TEXT" })).toBeUndefined();
    expect((await delivered).content).toBe("Confirming the agreed scope");
    await submitWork(f, "Completed authenticated end-to-end delivery");
    await releaseFunds(f);
    const before = await tokenBalance(f, f.developer.walletAddress);
    await claimFunds(f, f.developer);
    await claimFunds(f, fee);
    expect(await tokenBalance(f, f.developer.walletAddress) - before).toBe(97_500_000n);
    expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("COMPLETED");
  } finally {
    client.close(); developer.close();
  }
}, 240_000);

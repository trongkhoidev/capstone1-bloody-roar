import { afterAll, beforeAll, test } from "bun:test";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "../../../tests/e2e/harness/fixture";
import { mintUsdc } from "../../../tests/e2e/harness/funding";
import { claimable, tokenBalance } from "../../../tests/e2e/harness/payout";
import { login } from "../../../tests/e2e/harness/wallet";
import { waitFor } from "../../../tests/e2e/harness/waitFor";
import { injectWallet } from "./wallet";

const BASE = "http://localhost:4012";
const uiLog = fileURLToPath(new URL("../../../tests/e2e/.run/ui.log", import.meta.url));
let browser: Browser;

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  browser = await chromium.launch({ channel: "chrome" });
}, 120_000);

afterAll(() => browser?.close());

// Opens a page signed in as `account`, with the fake wallet on `walletAccount` (defaults to the same account).
async function asUser(account: string, walletAccount = account): Promise<Page> {
  const { cookie } = await login(account);
  const context = await browser.newContext();
  // The web server runs in dev mode, so the first visit to a page compiles it; allow for that.
  context.setDefaultTimeout(120_000);
  const [name, ...value] = cookie.split("=");
  await context.addCookies([{ name: name!, value: value.join("="), domain: "localhost", path: "/" }]);
  await injectWallet(context, walletAccount);
  const page = await context.newPage();
  page.on("console", (message) => appendFileSync(uiLog, `[${account}] console ${message.type()}: ${message.text()}\n`));
  page.on("pageerror", (error) => appendFileSync(uiLog, `[${account}] pageerror: ${error.message}\n`));
  page.on("response", async (response) => {
    if (!response.url().includes("/api/")) return;
    // Issue responses are logged in full enough to show developerId, status and viewerCapabilities.
    const text = response.url().includes("/api/graphql") ? await response.text().catch(() => "") : "";
    const body = text.includes("viewerCapabilities") ? text.slice(0, 4000) : text.slice(0, 300);
    appendFileSync(uiLog, `[${account}] ${response.status()} ${response.request().method()} ${response.url()} ${body}\n`);
  });
  return page;
}

// On a miss, dumps the page text to ui.log before failing, so the cause shows up after the run.
async function clickButton(page: Page, name: string) {
  try {
    await page.getByRole("button", { name }).click();
  } catch (error) {
    const text = await page.locator("body").innerText().catch(() => "");
    appendFileSync(uiLog, `[dump] no "${name}" button. Page text:\n${text.slice(0, 2000)}\n`);
    throw error;
  }
}

const expectNoError = (page: Page) => expect(page.locator(".bn-bad")).toHaveCount(0);

test("E32: client funds, developer delivers, client releases, developer claims, all through the UI", async () => {
  const f = await fixture();
  const selection = await f.select(f.applicationId);
  expect(selection.errors?.length ?? 0).toBe(0);
  await mintUsdc(f, f.accounts[2]!, 100000000n);
  const issueUrl = `${BASE}/issues/${f.issueId}`;

  const client = await asUser(f.accounts[2]!);
  await client.goto(issueUrl, { waitUntil: "domcontentloaded" });
  await clickButton(client, "Fund escrow");
  await waitFor(async () => (await f.prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } }))?.phase === "FUNDED");
  await expectNoError(client);

  const developer = await asUser(f.accounts[3]!);
  await developer.goto(issueUrl, { waitUntil: "domcontentloaded" });
  // The submit form lives under the Delivery & Submissions tab, not the default Overview tab.
  await developer.getByRole("tab", { name: /Delivery & Submissions/ }).click();
  try {
    await developer.getByPlaceholder("Summary of changes and test instructions...").fill("Fixed the release flow and added a regression test.");
  } catch (error) {
    appendFileSync(uiLog, `[dump] no delivery textarea. Page text:\n${(await developer.locator("body").innerText().catch(() => "")).slice(0, 2000)}\n`);
    throw error;
  }
  await developer.getByRole("button", { name: "Submit for review" }).click();
  await waitFor(async () => (await f.prisma.submission.findFirst({ where: { issueId: f.issueId, status: "SUBMITTED" } })) !== null);
  await expectNoError(developer);

  // Release credits the developer's claimable balance; the delta is this bounty's 97.5 USDC after the 250 bps fee.
  const owedBeforeRelease = await claimable(f.prisma, f.developer.walletAddress);
  await client.reload({ waitUntil: "domcontentloaded" });
  await client.getByRole("tab", { name: /Delivery & Submissions/ }).click();
  await client.getByRole("button", { name: "Approve delivery" }).click();
  await waitFor(async () => (await f.prisma.issue.findUnique({ where: { id: f.issueId } }))?.status === "COMPLETED");
  await waitFor(async () => (await claimable(f.prisma, f.developer.walletAddress)) - owedBeforeRelease === 97500000n);
  await expectNoError(client);

  // The developer withdraws everything owed, which includes unclaimed balances from earlier files that share this account.
  const owed = await claimable(f.prisma, f.developer.walletAddress);
  const balanceBefore = await tokenBalance(f, f.accounts[3]!);
  await developer.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await developer.getByRole("button", { name: "Rút tiền" }).click();
  await waitFor(async () => (await tokenBalance(f, f.accounts[3]!)) - balanceBefore === owed);
  await expectNoError(developer);
}, 300_000);

test("E32: the UI refuses to sign when the wallet account differs from the signed-in account", async () => {
  const f = await fixture();
  const selection = await f.select(f.applicationId);
  expect(selection.errors?.length ?? 0).toBe(0);

  const page = await asUser(f.accounts[2]!, f.accounts[4]!);
  await page.goto(`${BASE}/issues/${f.issueId}`, { waitUntil: "domcontentloaded" });
  const intentsBefore = await f.prisma.transactionIntent.count({ where: { issueId: f.issueId } });
  await clickButton(page, "Fund escrow");

  await expect(page.locator(".bn-bad")).toContainText("khác tài khoản đăng nhập");
  expect(await f.prisma.fundingReservation.count({ where: { issueId: f.issueId, status: "AWAITING_FUNDING" } })).toBe(1);
  expect(await f.prisma.transactionIntent.count({ where: { issueId: f.issueId } })).toBe(intentsBefore);
}, 120_000);

// @ts-ignore
import { describe, expect, it } from "bun:test";
import { DemoPopulator } from "./populate";
import { getDeterministicIp } from "./lib/session";

describe("Demo Populator Plan and Quantities (R5)", () => {
  it("enforces deterministic IPs per wallet role", () => {
    const ip1 = getDeterministicIp("user01");
    const ip2 = getDeterministicIp("user01");
    expect(ip1).toBe(ip2);
    expect(ip1.startsWith("10.77.")).toBe(true);

    const ip3 = getDeterministicIp("user02");
    expect(ip3).not.toBe(ip1);
  });

  it("plans all waves matching Definition of Done targets in --dry-run mode", async () => {
    const populator = new DemoPopulator({ dryRun: true });

    // W1: 40 profiles
    const w1 = await populator.runWave1();
    expect(w1.updatedCount).toBe(40);

    // W2: 150 issues
    const w2 = await populator.runWave2();
    expect(w2.createdIssuesCount).toBe(150);

    // W3: 500 comments
    const w3 = await populator.runWave3();
    expect(w3.commentsCount).toBe(500);

    // W4: 350 applications, 15 withdraws, 20 rejects
    const w4 = await populator.runWave4();
    expect(w4.appliedCount).toBeGreaterThanOrEqual(350);
    expect(w4.withdrawnCount).toBe(15);
    expect(w4.rejectedCount).toBe(20);

    // W5: 45 reservations, 35 funded, 4 cancelled
    const w5 = await populator.runWave5();
    expect(w5.selectedCount).toBe(45);
    expect(w5.fundedCount).toBe(35);
    expect(w5.cancelledCount).toBe(4);

    // W6: 35 chat rooms
    const w6 = await populator.runWave6();
    expect(w6.roomsProcessed).toBe(35);

    // W7: 28 submissions, 5 revisions
    const w7 = await populator.runWave7();
    expect(w7.submittedCount).toBe(28);
    expect(w7.revisedCount).toBe(5);

    // W8: outcomes (release >= 16, settlement >= 4, dispute >= 5)
    const w8 = await populator.runWave8();
    expect(w8.releases).toBeGreaterThanOrEqual(16);
    expect(w8.settlements).toBeGreaterThanOrEqual(4);
    expect(w8.disputes).toBeGreaterThanOrEqual(5);

    // W9: 14 reviews, 2 spam issues hidden, 1 banned spammer
    const w9 = await populator.runWave9();
    expect(w9.reviewsCount).toBeGreaterThanOrEqual(14);
    expect(w9.spamIssuesHidden).toBe(2);
    expect(w9.bannedSpammer).toBe(true);
  });
});

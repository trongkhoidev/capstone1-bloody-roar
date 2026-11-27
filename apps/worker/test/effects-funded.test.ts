import { expect, test } from "bun:test";
import type { Prisma } from "@bloody-roar/database";
import { applyFunded, type EffectMeta } from "../src/effects/escrow";

const hash = (value: string) => `0x${value.repeat(64)}` as `0x${string}`;
const address = (value: string) => `0x${value.repeat(40)}` as `0x${string}`;
const deadline = 1_900_000_000n;

function setup(options: { applicationStatus: string; reservationStatus: string; issueStatus: string }) {
  const reservation = {
    id: "reservation", issueId: "issue", applicationId: "application", clientId: "client", developerId: "developer",
    escrowKey: "br_issue_1", escrowIdHash: hash("2"), chainId: 31337, contractAddress: address("1"),
    status: options.reservationStatus, amountRaw: { toFixed: () => "100" },
    deliveryDeadline: new Date(Number(deadline) * 1000), termsHash: hash("7"),
  };
  const issue = { id: "issue", status: options.issueStatus, title: "Bounty", developerId: null as string | null };
  const application = { id: "application", status: options.applicationStatus };
  const notifications: { userId: string; type: string; title: string; body: string; data: Record<string, string> }[] = [];
  const projections: unknown[] = [];
  const calls: string[] = [];
  const tx = {
    fundingReservation: {
      findUnique: async () => reservation,
      updateMany: async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
        if (reservation.status !== where.status) return { count: 0 };
        Object.assign(reservation, data);
        return { count: 1 };
      },
    },
    issue: {
      findUniqueOrThrow: async () => issue,
      updateMany: async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
        if (issue.status !== where.status) return { count: 0 };
        Object.assign(issue, data);
        return { count: 1 };
      },
    },
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ walletAddress: where.id === "client" ? address("a") : address("b") }),
      findMany: async () => [{ id: "admin" }],
    },
    application: {
      findUnique: async () => application,
      findUniqueOrThrow: async () => {
        calls.push("application.read");
        return application;
      },
      findMany: async () => [],
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(application, data),
      updateMany: async () => ({ count: 0 }),
    },
    escrowProjection: { create: async ({ data }: { data: unknown }) => projections.push(data) },
    transactionIntent: { updateMany: async () => ({ count: 1 }) },
    conversation: { findFirst: async () => ({ id: "conversation" }), update: async () => ({}) },
    conversationParticipant: { deleteMany: async () => ({ count: 0 }), upsert: async () => ({}) },
    message: { createMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => ({ createdAt: new Date() }) },
    notification: {
      createMany: async ({ data }: { data: (typeof notifications)[number][] }) => {
        notifications.push(...data);
        return { count: data.length };
      },
      findUniqueOrThrow: async () => ({ id: `notification-${notifications.length}` }),
    },
    $executeRaw: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (strings.join("?").includes("FOR UPDATE")) calls.push("issue.lock");
      return [];
    },
  };
  const meta: EffectMeta = { chainId: 31337, contractAddress: address("1"), chainEventId: "event", escrowIdHash: hash("2"),
    blockNumber: 1n, blockHash: hash("3"), txHash: hash("4"), txIndex: 0, logIndex: 0, blockTimestamp: 1_800_000_000n };
  const effect = { kind: "FUNDED" as const, escrowIdHash: hash("2"), client: address("a"), developer: address("b"),
    arbiter: address("c"), feeRecipient: address("d"), amount: 100n, deliveryDeadline: deadline, termsHash: hash("7") };
  const run = () => applyFunded(tx as unknown as Prisma.TransactionClient, effect as never, meta);
  return { run, reservation, issue, application, notifications, projections, calls };
}

test("a deposit for a withdrawn application is a mismatch and keeps the application withdrawn", async () => {
  const state = setup({ applicationStatus: "WITHDRAWN", reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  await state.run();
  expect(state.reservation.status).toBe("MISMATCHED");
  expect(state.application.status).toBe("WITHDRAWN");
  expect(state.issue.status).toBe("OPEN");
  expect(state.projections).toHaveLength(0);
  expect(state.notifications.map((n) => n.type)).toEqual(["DEPOSIT_MISMATCHED", "DEPOSIT_MISMATCHED", "DEPOSIT_MISMATCHED"]);
  expect(state.notifications[0].data.reasons).toBe("application");
});

test("a late deposit on an open issue whose application was withdrawn is a mismatch", async () => {
  const state = setup({ applicationStatus: "WITHDRAWN", reservationStatus: "EXPIRED", issueStatus: "OPEN" });
  await state.run();
  expect(state.reservation.status).toBe("MISMATCHED");
  expect(state.application.status).toBe("WITHDRAWN");
  expect(state.issue.status).toBe("OPEN");
  expect(state.projections).toHaveLength(0);
  expect(state.notifications[0].data.reasons).toBe("application");
});

test("a matching deposit for a pending application is accepted", async () => {
  const state = setup({ applicationStatus: "PENDING", reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  await state.run();
  expect(state.reservation.status).toBe("FUNDED");
  expect(state.application.status).toBe("ACCEPTED");
  expect(state.issue).toMatchObject({ status: "IN_PROGRESS", developerId: "developer" });
  expect(state.projections).toHaveLength(1);
  expect(state.notifications.map((n) => n.type)).toEqual(["DEPOSIT_CONFIRMED", "APPLICATION_ACCEPTED", "TASK_ASSIGNED"]);
});

test("a late deposit while another reservation holds the issue names the late reason", async () => {
  const state = setup({ applicationStatus: "PENDING", reservationStatus: "EXPIRED", issueStatus: "AWAITING_FUNDING" });
  await state.run();
  expect(state.reservation.status).toBe("MISMATCHED");
  expect(state.notifications[0].data.reasons).toBe("late");
  expect(state.notifications[0].body).toBe(
    "The deposit for “Bounty” does not match: it arrived after the reservation expired and the Issue is no longer open. Manual review is required.",
  );
});

test("mismatch notifications name every reason", async () => {
  const state = setup({ applicationStatus: "WITHDRAWN", reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  state.reservation.termsHash = hash("8");
  await state.run();
  expect(state.notifications[0].data.reasons).toBe("termsHash,application");
  expect(state.notifications[0].body).toBe(
    "The deposit for “Bounty” does not match: the terms hash differs; the Application is no longer pending. Manual review is required.",
  );
});

test("deposit notifications are written in English", async () => {
  const mismatch = setup({ applicationStatus: "WITHDRAWN", reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  await mismatch.run();
  expect(mismatch.notifications[0]).toMatchObject({
    title: "Deposit does not match the terms",
    body: "The deposit for “Bounty” does not match: the Application is no longer pending. Manual review is required.",
  });
  const accepted = setup({ applicationStatus: "PENDING", reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  await accepted.run();
  expect(accepted.notifications[0]).toMatchObject({
    title: "Deposit confirmed",
    body: "The deposit for “Bounty” was recorded on-chain.",
  });
});

test("locks the issue row before reading the application so a concurrent withdraw cannot be revived", async () => {
  const state = setup({ applicationStatus: "PENDING", reservationStatus: "EXPIRED", issueStatus: "OPEN" });
  await state.run();
  expect(state.calls).toEqual(["issue.lock", "application.read"]);
});

import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
test("E4: applications, notifications and atomic developer selection", async () => {
  const f = await fixture();
  expect((await f.apply(f.client)).errors?.[0]?.extensions?.code).toBe("SELF_APPLICATION");
  const selected = await f.select(f.applicationId);
  expect(selected.errors).toBeUndefined();
  expect((selected.data?.selectDeveloper as { status: string }).status).toBe("AWAITING_FUNDING");
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("AWAITING_FUNDING");
  expect((await f.prisma.application.findUniqueOrThrow({ where: { id: f.rivalApplicationId } })).status).toBe("PENDING");
  expect(await f.prisma.notification.count({ where: { userId: f.client.id, type: "NEW_APPLICANT", data: { path: ["issueId"], equals: f.issueId } } })).toBe(2);
  expect(await f.prisma.notification.count({ where: { userId: f.developer.id, type: "FUNDING_REQUIRED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
  const race = await fixture();
  const results = await Promise.all([race.select(race.applicationId), race.select(race.rivalApplicationId)]);
  expect(results.filter((result) => !result.errors).length).toBe(1);
  expect(await f.prisma.fundingReservation.count({ where: { issueId: race.issueId, status: "AWAITING_FUNDING" } })).toBe(1);
}, 120_000);

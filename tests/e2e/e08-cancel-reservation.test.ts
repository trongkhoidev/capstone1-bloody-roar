import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { gqlAs } from "./harness/gql";
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
test("E8: only the client can cancel a reservation before funding", async () => {
  const f = await fixture();
  const selected = await f.select(f.applicationId);
  expect(selected.errors).toBeUndefined();
  const id = (selected.data?.selectDeveloper as { id: string }).id;
  const cancel = (actor: typeof f.client) => gqlAs(actor, `mutation($id: ID!) { cancelReservation(reservationId: $id) { status } }`, { id });
  expect((await cancel(f.developer)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  expect((await cancel(f.client)).data?.cancelReservation).toEqual({ status: "CANCELLED" });
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("OPEN");
}, 120_000);

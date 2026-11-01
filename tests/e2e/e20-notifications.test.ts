import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { gqlAs } from "./harness/gql";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const page = (user: Parameters<typeof gqlAs>[0], first: number, after?: string) =>
  gqlAs(user, `query($first: Int, $after: ID) { notifications(first: $first, after: $after) { id isRead } }`, { first, after }).then((result) => {
    if (result.errors?.length) throw new Error(result.errors[0]?.message);
    return result.data?.notifications as Array<{ id: string; isRead: boolean }>;
  });
const unread = async (user: Parameters<typeof gqlAs>[0]) => {
  const result = await gqlAs(user, `query { unreadNotificationCount }`);
  return result.data?.unreadNotificationCount as number;
};

test("E20: notifications page with a cursor, count unread, and mark one or all as read", async () => {
  const f = await fixture();
  // Each apply notifies the client with NEW_APPLICANT, so the client already has notifications from the fixture.
  const before = await unread(f.client);
  expect(before).toBeGreaterThanOrEqual(2);

  const firstPage = await page(f.client, 1);
  expect(firstPage).toHaveLength(1);
  const secondPage = await page(f.client, 1, firstPage[0]!.id);
  expect(secondPage).toHaveLength(1);
  expect(secondPage[0]!.id).not.toBe(firstPage[0]!.id);

  const target = firstPage[0]!;
  const unreadBefore = await unread(f.client);
  const marked = await gqlAs(f.client, `mutation($id: ID!) { markNotificationRead(id: $id) { id isRead } }`, { id: target.id });
  expect(marked.errors).toBeUndefined();
  expect(marked.data?.markNotificationRead).toMatchObject({ id: target.id, isRead: true });
  expect(await unread(f.client)).toBe(unreadBefore - (target.isRead ? 0 : 1));

  const all = await gqlAs(f.client, `mutation { markAllNotificationsRead }`);
  expect(all.errors).toBeUndefined();
  expect(all.data?.markAllNotificationsRead as number).toBeGreaterThanOrEqual(0);
  expect(await unread(f.client)).toBe(0);
});

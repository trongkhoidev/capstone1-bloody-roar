import { Client } from "pg";

// One worker per database. The lock is a session lock, so it lives on a dedicated connection.
export const WORKER_LOCK_KEY = 4219270001;

export type WorkerLock = { release(): Promise<void>; isHeld(): boolean };

export async function tryAcquireWorkerLock(connectionString: string): Promise<WorkerLock | null> {
  const client = new Client({ connectionString });
  let held = false;
  // Connection lost means the session lock is gone too.
  client.on("error", () => {
    held = false;
  });
  await client.connect();
  const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [WORKER_LOCK_KEY]);
  if (!rows[0]?.locked) {
    await client.end();
    return null;
  }
  held = true;
  return {
    isHeld: () => held,
    async release() {
      if (held) await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY]).catch(() => undefined);
      held = false;
      await client.end();
    },
  };
}

export function assertTestDatabase(url: string | undefined): asserts url is string {
  let name: string;
  try {
    const parsed = new URL(url ?? "");
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error();
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("TEST_DATABASE_URL must use localhost or 127.0.0.1");
    }
    name = decodeURIComponent(parsed.pathname.slice(1));
  } catch (error) {
    if (error instanceof Error && error.message.includes("localhost")) throw error;
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL for a database ending in _test");
  }
  if (!name.endsWith("_test") || ["bloody_roar_local", "bloody_roar_dev", "bloody_integration", "bloody_codex_local"].includes(name)) {
    throw new Error("TEST_DATABASE_URL must point to a database ending in _test");
  }
}

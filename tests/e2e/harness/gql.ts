export async function gql(query: string, variables: Record<string, unknown> = {}, cookie = "") {
  const response = await fetch("http://localhost:4012/api/graphql", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
  return response.json() as Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string; extensions?: { code?: string } }> }>;
}

// Most scenarios use Yoga directly while retaining the actual schema and resolver context.
export async function gqlAs(user: unknown, query: string, variables: Record<string, unknown> = {}) {
  const { assertTestDatabase } = await import("@bloody-roar/database/test-guard");
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
  const [{ prisma }, { execute, loadSchema }] = await Promise.all([
    import("@bloody-roar/database"), import("../../../apps/web/src/test/graphql-execute"),
  ]);
  await loadSchema();
  return execute(query, { db: prisma, user }, variables);
}

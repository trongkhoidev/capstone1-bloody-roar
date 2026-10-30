export async function gql(query: string, variables: Record<string, unknown> = {}, cookie = "") {
  const response = await fetch("http://localhost:4012/api/graphql", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
  return response.json() as Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string; extensions?: { code?: string } }> }>;
}

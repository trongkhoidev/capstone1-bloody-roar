const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown[]; path?: unknown[]; extensions?: { code?: string } }>;
}

export async function gqlRequest<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {},
  options: {
    cookie?: string | undefined;
    ip?: string | undefined;
    baseUrl?: string | undefined;
  } = {}
): Promise<T> {
  const baseUrl = options.baseUrl || process.env.BASE_URL || "http://localhost:4001";
  const url = `${baseUrl}/api/graphql`;

  // Random delay between 300ms and 800ms to stay well below rate limit
  const delay = Math.floor(Math.random() * 500) + 300;
  await sleep(delay);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie) headers["cookie"] = options.cookie;
  if (options.ip) headers["x-forwarded-for"] = options.ip;

  let res: Response | null = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status === 404 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        await sleep(Math.max(retryAfter * 1000, 2500));
        continue;
      }
      break;
    } catch {
      await sleep(2500);
    }
  }

  if (!res || !res.ok) {
    const text = res ? await res.text() : "Network error";
    throw new Error(`GraphQL HTTP ${res?.status ?? "ERR"}: ${text}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    const first = json.errors[0];
    const code = first?.extensions?.code ? ` [${first.extensions.code}]` : "";
    throw new Error(`GraphQL Error${code}: ${first?.message ?? "Unknown error"}`);
  }

  return json.data as T;
}

import { getOperationAST, Kind, type DocumentNode, type SelectionSetNode } from "graphql";
import { createYoga, type Plugin } from "graphql-yoga";
import { schema } from "../../../graphql/schema";
import { createContext } from "../../../graphql/context";
import { guardsPlugin, MAX_BODY_BYTES, operationCost } from "../../../graphql/yoga-guards";
import { clearAuthCache } from "../../../lib/auth";
import { logger } from "../../../lib/logger";
import { clientIp, rateLimit, tooManyRequests } from "../../../lib/rate-limit";
import { requestIdFrom, withRequestId } from "../../../lib/request-context";

const dev = process.env.NODE_ENV !== "production";

// Points per client per minute: a mutation spends 5, a query 1.
const GRAPHQL_POINTS_PER_MINUTE = 600;

const AUTH_MUTATIONS = new Set([
  "banUser", "unbanUser", "setUserRole", "updateProfile", "unlinkGithub",
  "revokeSession", "revokeOtherSessions", "submitReview",
]);

function changesAuth(document: DocumentNode, selections: SelectionSetNode): boolean {
  return selections.selections.some((selection) => {
    if (selection.kind === Kind.FIELD) return AUTH_MUTATIONS.has(selection.name.value);
    if (selection.kind === Kind.INLINE_FRAGMENT) return changesAuth(document, selection.selectionSet);
    const fragment = document.definitions.find((definition) =>
      definition.kind === Kind.FRAGMENT_DEFINITION && definition.name.value === selection.name.value);
    return fragment?.kind === Kind.FRAGMENT_DEFINITION && changesAuth(document, fragment.selectionSet);
  });
}

const logOperations: Plugin = {
  onExecute({ args }) {
    const started = performance.now();
    const ast = getOperationAST(args.document, args.operationName);
    const operation = ast?.name?.value ?? "anonymous";
    return {
      onExecuteDone({ result }) {
        // Mutations can change the user row or revoke sessions; never serve a cached user after one.
        if (ast?.operation === "mutation" && changesAuth(args.document, ast.selectionSet)) clearAuthCache();
        const errors = "errors" in result ? result.errors?.map((error) => error.message) : undefined;
        logger.info({ operation, durationMs: Math.round(performance.now() - started), errors }, "graphql operation");
      },
    };
  },
};

const { handleRequest } = createYoga({
  schema,
  context: createContext,
  plugins: [guardsPlugin, logOperations],
  maxRequestBodySize: MAX_BODY_BYTES,
  // Tích hợp GraphQL endpoint chuẩn cho Next.js App Router
  graphqlEndpoint: "/api/graphql",
  
  // Next.js (App Router) sử dụng Web Fetch API chuẩn
  fetchAPI: { Response },
  
  // Enable GraphiQL in development
  graphiql: dev
    ? {
        title: "Bloody-Roar GraphQL",
        defaultQuery: `
# Welcome to Bloody-Roar GraphQL API!
# Try this query:
query {
  hello
}
        `.trim(),
      }
    : false,
  logging: {
    debug: (...args) => logger.debug(args),
    info: (...args) => logger.info(args),
    warn: (...args) => logger.warn(args),
    error: (...args) => logger.error(args),
  },
});

async function queryOf(request: Request): Promise<string | null> {
  if (request.method === "GET") return new URL(request.url).searchParams.get("query");
  const body = (await request.clone().json().catch(() => null)) as { query?: unknown } | null;
  return typeof body?.query === "string" ? body.query : null;
}

// Each request runs under its own id, so resolver logs and the response header agree.
async function handle(...args: Parameters<typeof handleRequest>) {
  const [request] = args;
  const limit = rateLimit(`graphql:${clientIp(request)}`, {
    limit: GRAPHQL_POINTS_PER_MINUTE,
    windowMs: 60_000,
    cost: operationCost(await queryOf(request)),
  });
  if (!limit.ok) return tooManyRequests(limit.retryAfterMs);

  const requestId = requestIdFrom(request);
  const response = await withRequestId(requestId, () => handleRequest(...args));
  response.headers.set("x-request-id", requestId);
  return response;
}

export { handle as GET, handle as POST, handle as OPTIONS };

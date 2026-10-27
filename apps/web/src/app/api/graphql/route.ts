import { getOperationAST } from "graphql";
import { createYoga, type Plugin } from "graphql-yoga";
import { schema } from "../../../graphql/schema";
import { createContext } from "../../../graphql/context";
import { guardsPlugin, MAX_BODY_BYTES, operationCost } from "../../../graphql/yoga-guards";
import { logger } from "../../../lib/logger";
import { clientIp, rateLimit, tooManyRequests } from "../../../lib/rate-limit";
import { requestIdFrom, withRequestId } from "../../../lib/request-context";

const dev = process.env.NODE_ENV !== "production";

// Points per client per minute: a mutation spends 5, a query 1.
const GRAPHQL_POINTS_PER_MINUTE = 600;

const logOperations: Plugin = {
  onExecute({ args }) {
    const started = performance.now();
    const operation = getOperationAST(args.document, args.operationName)?.name?.value ?? "anonymous";
    return {
      onExecuteDone({ result }) {
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

import { getOperationAST } from "graphql";
import { createYoga, type Plugin } from "graphql-yoga";
import { schema } from "../../../graphql/schema";
import { createContext } from "../../../graphql/context";
import { guardsPlugin, MAX_BODY_BYTES } from "../../../graphql/yoga-guards";
import { logger } from "../../../lib/logger";
import { requestIdFrom, withRequestId } from "../../../lib/request-context";

const dev = process.env.NODE_ENV !== "production";

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

// Each request runs under its own id, so resolver logs and the response header agree.
async function handle(...args: Parameters<typeof handleRequest>) {
  const requestId = requestIdFrom(args[0]);
  const response = await withRequestId(requestId, () => handleRequest(...args));
  response.headers.set("x-request-id", requestId);
  return response;
}

export { handle as GET, handle as POST, handle as OPTIONS };

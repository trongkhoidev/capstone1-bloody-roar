import { createYoga } from "graphql-yoga";
import { schema } from "../../../graphql/schema";
import { createContext } from "../../../graphql/context";
import { logger } from "../../../lib/logger";

const dev = process.env.NODE_ENV !== "production";

const { handleRequest } = createYoga({
  schema,
  context: createContext,
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

export { handleRequest as GET, handleRequest as POST, handleRequest as OPTIONS };

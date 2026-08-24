import { createYoga } from "graphql-yoga";
import { schema } from "../../../graphql/schema";
import { createContext } from "../../../graphql/context";

const { handleRequest } = createYoga({
  schema,
  context: createContext,
  // Tích hợp GraphQL endpoint chuẩn cho Next.js App Router
  graphqlEndpoint: "/api/graphql",
  
  // Next.js (App Router) sử dụng Web Fetch API chuẩn
  fetchAPI: { Response },
});

export { handleRequest as GET, handleRequest as POST, handleRequest as OPTIONS };

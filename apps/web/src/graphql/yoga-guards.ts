// apps/web/src/graphql/yoga-guards.ts
// Query-shape limits, production introspection block and JSON-only POST. Body size is enforced by Yoga's maxRequestBodySize.

import {
  GraphQLError,
  NoSchemaIntrospectionCustomRule,
  parse,
  type ASTVisitor,
  type SelectionNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";
import type { Plugin } from "graphql-yoga";

export const MAX_QUERY_DEPTH = 10;
export const MAX_ALIASES = 10;
export const MAX_BODY_BYTES = 200 * 1024;

// Fragments are followed so a chain of small fragments cannot hide depth.
function depthOf(selections: readonly SelectionNode[], context: ValidationContext, memo: Map<string, number>): number {
  let deepest = 0;
  for (const selection of selections) {
    const depth =
      selection.kind === "Field"
        ? 1 + (selection.selectionSet ? depthOf(selection.selectionSet.selections, context, memo) : 0)
        : selection.kind === "InlineFragment"
          ? depthOf(selection.selectionSet.selections, context, memo)
          : fragmentDepth(selection.name.value, context, memo);
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

function fragmentDepth(name: string, context: ValidationContext, memo: Map<string, number>): number {
  const cached = memo.get(name);
  if (cached !== undefined) return cached;
  memo.set(name, 0); // a cycle is reported by NoFragmentCycles; stop here instead of recursing
  const fragment = context.getFragment(name);
  const depth = fragment ? depthOf(fragment.selectionSet.selections, context, memo) : 0;
  memo.set(name, depth);
  return depth;
}

// Mutations cost 5 points and queries 1. A document that does not parse costs 1 and fails validation later.
export function operationCost(query: string | null): number {
  if (!query) return 1;
  try {
    const mutation = parse(query).definitions.some(
      (definition) => "operation" in definition && definition.operation === "mutation",
    );
    return mutation ? 5 : 1;
  } catch {
    return 1;
  }
}

export const queryShapeRule: ValidationRule = (context: ValidationContext): ASTVisitor => {
  const memo = new Map<string, number>();
  let aliases = 0;
  return {
    Field(node) {
      if (node.alias) aliases += 1;
    },
    OperationDefinition(node) {
      const depth = depthOf(node.selectionSet.selections, context, memo);
      if (depth > MAX_QUERY_DEPTH) {
        context.reportError(new GraphQLError(`Query depth ${depth} exceeds the limit of ${MAX_QUERY_DEPTH}`));
      }
    },
    Document: {
      leave() {
        if (aliases > MAX_ALIASES) {
          context.reportError(new GraphQLError(`Query uses ${aliases} aliases; the limit is ${MAX_ALIASES}`));
        }
      },
    },
  };
};

export const guardsPlugin: Plugin = {
  onRequest({ request, endResponse }) {
    if (request.method === "POST" && !request.headers.get("content-type")?.startsWith("application/json")) {
      endResponse(
        new Response(JSON.stringify({ errors: [{ message: "POST requires content-type application/json" }] }), {
          status: 415,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  },
  onValidate({ addValidationRule }) {
    addValidationRule(queryShapeRule);
    if (process.env.NODE_ENV === "production") addValidationRule(NoSchemaIntrospectionCustomRule);
  },
};

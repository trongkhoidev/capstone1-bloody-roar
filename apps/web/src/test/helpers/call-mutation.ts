import { schema } from "../../graphql/schema";

// Calls a mutation resolver directly; the GraphQL engine instance differs between test and schema modules.
export function callMutation(name: string, args: Record<string, unknown>, user: unknown, db: unknown) {
  const field = schema.getMutationType()?.getFields()[name];
  if (!field?.resolve) throw new Error(`no resolver for ${name}`);
  return field.resolve({} as never, args, { db, user } as never, {} as never);
}

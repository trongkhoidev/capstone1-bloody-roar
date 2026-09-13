// apps/web/src/graphql/schema.ts
// GraphQL schema — built with Pothos (code-first)
// Each module lives in src/graphql/modules/*/

import { builder } from "./builder";

// -----------------------------------------------------------------------
// Hello World — Sprint 0 smoke test
// -----------------------------------------------------------------------
builder.queryField("hello", (t) =>
  t.string({
    description: "Health check — returns platform greeting",
    resolve: () => "👋 Welcome to Bloody-Roar GraphQL API!",
  })
);

// -----------------------------------------------------------------------
// Load modules (each module registers its own types/queries/mutations)
// -----------------------------------------------------------------------

// Sprint 1+: uncomment as modules are built
import "./modules/user/user.module";
import "./modules/issue/issue.module";
import "./modules/issue/issue-comment.module";
import "./modules/application/application.module";
import "./modules/submission/submission.module";
import "./modules/ai/ai.module";
// import "./modules/escrow/escrow.module";
import "./modules/chat/chat.module";
import "./modules/dispute/dispute.module";
import "./modules/notification/notification.module";
import "./modules/analytics/analytics.module";
import "./modules/admin/admin.module";

// Build and export the schema
export const schema = builder.toSchema();

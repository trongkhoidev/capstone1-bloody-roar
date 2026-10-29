import { CreateIssueForm } from "@/components/issues/create-issue-form";
import { guardRoute } from "@/lib/server-session";

export const dynamic = "force-dynamic";

// Developers still reach the form, which explains how to switch to client mode.
export default async function CreateIssuePage() {
  await guardRoute(["CLIENT", "DEVELOPER"]);
  return <CreateIssueForm />;
}

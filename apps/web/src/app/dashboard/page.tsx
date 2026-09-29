import { DashboardView } from "@/components/dashboard/dashboard-view";
import { guardRoute } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await guardRoute(["CLIENT", "DEVELOPER"]);
  return <DashboardView />;
}

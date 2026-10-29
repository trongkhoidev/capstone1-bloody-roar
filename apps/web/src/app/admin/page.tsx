import { AdminView } from "@/components/admin/admin-view";
import { guardRoute } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await guardRoute(["ADMIN"]);
  return <AdminView />;
}

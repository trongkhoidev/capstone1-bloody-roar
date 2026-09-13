"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MarketplaceView } from "@/components/marketplace/marketplace-view";
import { useAuthStore } from "@/lib/store/use-auth-store";

export function HomePageView({ search = "" }: { search?: string }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") router.replace("/admin");
  }, [router, status, user?.role]);

  return <MarketplaceView initialSearch={search} />;
}

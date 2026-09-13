"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { UiPreferenceControls } from "@/components/layout/ui-preference-controls";

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const { t } = useUiPreferences();
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[hsl(var(--border))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6 md:gap-10">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-outfit text-xl font-bold text-[hsl(var(--primary))] shadow-[var(--shadow-glow)]">
              Bloody-Roar
            </span>
          </Link>
          <nav className="hidden gap-6 md:flex">
            <Link
              href="/"
              aria-current={pathname === "/" || pathname === "/marketplace" ? "page" : undefined}
              className={`flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${pathname === "/" || pathname === "/marketplace" ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--primary))]"}`}
            >
              {t("marketplace")}
            </Link>
            {user && <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} aria-current={pathname.startsWith(user.role === "ADMIN" ? "/admin" : "/dashboard") ? "page" : undefined} className={`flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${pathname.startsWith(user.role === "ADMIN" ? "/admin" : "/dashboard") ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"}`}>{user.role === "ADMIN" ? t("admin") : t("dashboard")}</Link>}
            {user?.role !== "ADMIN" && <Link
              href="/issues/create"
              aria-current={pathname === "/issues/create" ? "page" : undefined}
              className={`flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${pathname === "/issues/create" ? "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
            >
              {t("createBounty")}
            </Link>}
          </nav>
        </div>
        
        <div className="flex flex-1 items-center justify-end space-x-3">
          <form action="/" method="get" className="w-full max-w-sm hidden md:flex items-center relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Input
              type="search"
              name="search"
              placeholder={t("searchTasks")}
              className="w-full bg-[hsl(var(--card))] pl-8 border-[hsl(var(--border))]"
            />
          </form>

          <div className="hidden md:block"><UiPreferenceControls /></div>

          <div className="hidden sm:block"><NotificationsMenu /></div>
          
          <div className="hidden sm:block">
            <UserMenu />
          </div>
          
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

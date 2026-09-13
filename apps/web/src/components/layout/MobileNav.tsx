"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, Compass, LayoutDashboard, PlusCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu } from "@/components/layout/user-menu";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { UiPreferenceControls } from "@/components/layout/ui-preference-controls";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const { t } = useUiPreferences();

  const handleLinkClick = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-[hsl(var(--foreground))]"
          aria-label="Open Navigation Menu"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col justify-between">
        <div className="space-y-6">
          <SheetHeader className="text-left border-b border-[hsl(var(--border))] pb-4">
            <SheetTitle className="font-outfit text-xl font-bold text-[hsl(var(--primary))] flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-[hsl(var(--primary))]" />
              Bloody-Roar
            </SheetTitle>
          </SheetHeader>

          {/* Search bar on Mobile */}
          <form action="/" method="get" className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Input
              type="search"
              name="search"
              placeholder={t("searchTasks")}
              className="w-full bg-[hsl(var(--card))] pl-9 border-[hsl(var(--border))]"
            />
          </form>

          {/* Navigation Links */}
          <nav className="flex flex-col space-y-3 pt-2">
            <Link
              href="/"
              onClick={handleLinkClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))]"
            >
              <Compass className="h-4 w-4" />
              {t("marketplace")}
            </Link>

            {user?.role !== "ADMIN" && <Link
              href="/issues/create"
              onClick={handleLinkClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))]"
            >
              <PlusCircle className="h-4 w-4" />
              {t("createBounty")}
            </Link>}
            {user && <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} onClick={handleLinkClick} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))]">
              <LayoutDashboard className="h-4 w-4" />
              {user.role === "ADMIN" ? t("admin") : t("dashboard")}
            </Link>}
          </nav>
        </div>

        {/* Footer with Wallet button */}
        <div className="border-t border-[hsl(var(--border))] pt-4">
          <UiPreferenceControls />
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wider">
              Account / Wallet
            </span>
            <div className="flex justify-start">
              <UserMenu />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

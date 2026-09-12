import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ConnectWalletBtn } from "@/components/auth/ConnectWalletBtn";
import { MobileNav } from "@/components/layout/MobileNav";

export function Navbar() {
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
              className="flex items-center text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:text-[hsl(var(--primary))]"
            >
              Marketplace
            </Link>
            <Link
              href="/tasks/create"
              className="flex items-center text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              Create Task
            </Link>
          </nav>
        </div>
        
        <div className="flex flex-1 items-center justify-end space-x-3">
          <div className="w-full max-w-sm hidden md:flex items-center relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Input
              type="search"
              placeholder="Search tasks..."
              className="w-full bg-[hsl(var(--card))] pl-8 border-[hsl(var(--border))]"
            />
          </div>
          
          <div className="hidden sm:block">
            <ConnectWalletBtn />
          </div>
          
          <MobileNav />
        </div>
      </div>
    </header>
  );
}


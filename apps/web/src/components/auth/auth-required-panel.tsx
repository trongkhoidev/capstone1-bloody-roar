"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectModal } from "./connect-modal";
import { useAuthStore } from "@/lib/store/use-auth-store";

type AuthRequiredPanelProps = {
  title: string;
  description: string;
  actionLabel?: string;
  compact?: boolean;
};

/** A single, consistent entry point for flows that require a signed wallet session. */
export function AuthRequiredPanel({
  title,
  description,
  actionLabel = "Connect wallet to continue",
  compact = false,
}: AuthRequiredPanelProps) {
  const [open, setOpen] = useState(false);
  const status = useAuthStore((state) => state.status);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  if (status === "session_error") return (
    <section role="alert" className="rounded-xl border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--card))] p-6">
      <p>Could not verify your session. Check your connection and try again.</p>
      <Button className="mt-5" onClick={() => void restoreSession()}>Try again</Button>
    </section>
  );

  return (
    <section className={`rounded-xl border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--card))] ${compact ? "p-4" : "p-6 sm:p-8"}`}>
      <LockKeyhole className={`text-[hsl(var(--primary))] ${compact ? "h-5 w-5" : "h-7 w-7"}`} />
      <h1 className={`${compact ? "mt-2 text-base" : "mt-4 text-2xl"} font-outfit font-bold`}>{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--foreground-muted))]">{description}</p>
      <Button className="mt-5" onClick={() => setOpen(true)}>
        {actionLabel}
      </Button>
      <ConnectModal isOpen={open} onClose={() => setOpen(false)} />
    </section>
  );
}

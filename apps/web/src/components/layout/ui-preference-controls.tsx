"use client";

import { Moon, Sun } from "lucide-react";
import { useUiPreferences } from "@/lib/ui-preferences";

export function UiPreferenceControls() {
  const { theme, setTheme, t } = useUiPreferences();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div className="flex items-center gap-1.5" aria-label={t("theme")}>
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink-2)] transition-colors hover:bg-[var(--sunk)] hover:text-[var(--ink)] cursor-pointer"
        aria-label={theme === "dark" ? t("lightTheme") : t("darkTheme")}
        title={theme === "dark" ? t("lightTheme") : t("darkTheme")}
        data-testid="theme-toggle"
      >
        {theme === "dark" ? <Sun className="h-4 w-4 text-[var(--gold)]" /> : <Moon className="h-4 w-4 text-[var(--ink-2)]" />}
      </button>
    </div>
  );
}

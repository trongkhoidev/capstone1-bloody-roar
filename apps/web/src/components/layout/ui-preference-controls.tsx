"use client";

import { Moon, Sun } from "lucide-react";
import { useUiPreferences } from "@/lib/ui-preferences";

export function UiPreferenceControls({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, theme, setTheme, t } = useUiPreferences();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div className="flex items-center gap-1.5" aria-label={`${t("language")} and ${t("theme")}`}>
      <button
        type="button"
        onClick={() => setLanguage(language === "en" ? "vi" : "en")}
        className="inline-flex h-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-xs font-semibold text-[hsl(var(--foreground-muted))] transition-colors hover:text-[hsl(var(--foreground))]"
        aria-label={`${t("language")}: ${language.toUpperCase()}. Switch language`}
        title={t("language")}
        data-testid="language-toggle"
      >
        {compact ? language.toUpperCase() : <><span className={language === "en" ? "text-[hsl(var(--primary))]" : ""}>EN</span><span className="px-1 opacity-50">/</span><span className={language === "vi" ? "text-[hsl(var(--primary))]" : ""}>VI</span></>}
      </button>
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground-muted))] transition-colors hover:text-[hsl(var(--foreground))]"
        aria-label={theme === "dark" ? t("lightTheme") : t("darkTheme")}
        title={theme === "dark" ? t("lightTheme") : t("darkTheme")}
        data-testid="theme-toggle"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}

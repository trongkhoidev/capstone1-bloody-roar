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
        className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--sunk)] hover:text-[var(--ink)] cursor-pointer"
        aria-label={`${t("language")}: ${language.toUpperCase()}. Switch language`}
        title={t("language")}
        data-testid="language-toggle"
      >
        {compact ? language.toUpperCase() : <><span className={language === "en" ? "text-[var(--link)] font-bold" : ""}>EN</span><span className="px-1 opacity-50">/</span><span className={language === "vi" ? "text-[var(--link)] font-bold" : ""}>VI</span></>}
      </button>
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

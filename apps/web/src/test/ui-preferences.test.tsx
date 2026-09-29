import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UiPreferencesProvider, useUiPreferences } from "@/lib/ui-preferences";
import { UiPreferenceControls } from "@/components/layout/ui-preference-controls";

function PreferenceProbe() {
  const { language, theme, t } = useUiPreferences();
  return <p>{language}|{theme}|{t("marketplace")}</p>;
}

describe("UI preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => cleanup());

  it("switches language and persists the selected value", () => {
    render(<UiPreferencesProvider><UiPreferenceControls /><PreferenceProbe /></UiPreferencesProvider>);

    fireEvent.click(screen.getByTestId("language-toggle"));

    expect(screen.getByText("vi|light|Chợ bounty")).toBeInTheDocument();
    expect(window.localStorage.getItem("bloody-roar-language")).toBe("vi");
    expect(document.documentElement.lang).toBe("vi");
  });

  it("switches theme and applies the matching document class", () => {
    render(<UiPreferencesProvider><UiPreferenceControls /><PreferenceProbe /></UiPreferencesProvider>);

    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(screen.getByText("en|dark|Marketplace")).toBeInTheDocument();
    expect(window.localStorage.getItem("bloody-roar-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});

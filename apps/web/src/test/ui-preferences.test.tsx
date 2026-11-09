import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UiPreferencesProvider, useUiPreferences } from "@/lib/ui-preferences";
import { UiPreferenceControls } from "@/components/layout/ui-preference-controls";

function PreferenceProbe() {
  const { theme, t } = useUiPreferences();
  return <p>{theme}|{t("marketplace")}</p>;
}

describe("UI preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => cleanup());

  it("initializes with English as the standard document language", () => {
    render(<UiPreferencesProvider><PreferenceProbe /></UiPreferencesProvider>);

    expect(screen.getByText("light|Bounties")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches theme and applies the matching document class", () => {
    render(<UiPreferencesProvider><UiPreferenceControls /><PreferenceProbe /></UiPreferencesProvider>);

    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(screen.getByText("dark|Bounties")).toBeInTheDocument();
    expect(window.localStorage.getItem("bloody-roar-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdminView } from "../components/admin/admin-view";

const { request, state } = vi.hoisted(() => ({ request: vi.fn(), state: { user: { id: "admin", role: "ADMIN" }, status: "authenticated" } }));
vi.mock("../lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select(state),
}));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ t: (key: string) => key }) }));

it.each([
  ["DISPUTED", "INITIAL", false],
  ["CHALLENGED", "FINAL", false],
  ["INITIAL_RULING", null, false],
  ["DISPUTED", "INITIAL", true],
] as const)(
  "offers the appropriate ruling in phase %s",
  async (phase, kind, tooEarly) => {
    request.mockReset();
    request.mockImplementation(async (query: string) => {
      if (query.includes("AdminDisputes")) return { adminDisputes: [{
        id: "dispute", issueId: "task", status: phase === "CHALLENGED" ? "CHALLENGED" : "OPEN",
        reason: "Dispute fixture", escrowPhase: phase, rulingOpensAt: tooEarly ? "2098-01-01T00:00:00Z" : "2026-01-01T00:00:00Z", rulingClosesAt: "2099-01-01T00:00:00Z",
      }] };
      if (query.includes("AdminStats")) return { adminStats: { users: 0, openTasks: 0, activeTasks: 0, completedTasks: 0, openDisputes: 0, completedBounties: [] } };
      if (query.includes("AdminIssues")) return { adminIssues: [] };
      if (query.includes("AdminUsers")) return { adminUsers: [] };
      return { draftRuling: { decisionHash: "hash", safeTransactionJson: "{}" } };
    });
    render(<AdminView />);
    await screen.findByText("Dispute fixture");
    if (!kind) {
      expect(screen.queryByRole("button", { name: "Draft ruling" })).toBeNull();
      return;
    }
    fireEvent.change(screen.getByPlaceholderText(/rationale for the ruling/i), { target: { value: "A sufficiently detailed explanation" } });
    const draftButton = screen.getByRole("button", { name: "Draft ruling" });
    if (tooEarly) {
      expect(screen.getByText(/Ruling window opens at/)).toBeInTheDocument();
      expect(draftButton).toBeDisabled();
      return;
    }
    fireEvent.click(draftButton);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation DraftRuling"), expect.objectContaining({ kind })));
  },
);

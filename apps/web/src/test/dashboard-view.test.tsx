import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DashboardView } from "../components/dashboard/dashboard-view";

const { request, state } = vi.hoisted(() => ({
  request: vi.fn(),
  state: { user: { id: "developer", role: "DEVELOPER", walletAddress: "0x1234567890" }, status: "authenticated" },
}));
vi.mock("../lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (select: (value: typeof state) => unknown) => select(state) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));

it("shows an application in All work even when the developer has no tasks", async () => {
  request.mockImplementation(async (query: string) => query.includes("myClaimable") ? { myClaimable: [] } : ({
    userStats: { postedTasks: 0, workingTasks: 0, completedTasks: 0, applications: 1, completedPayouts: 0 },
    myIssues: [],
    myApplications: [{
      id: "application", status: "PENDING", createdAt: "2026-01-01",
      issue: { id: "issue", title: "Audit escrow", status: "OPEN", bountyAmount: { formatted: "100" }, token: { symbol: "USDC" }, client: { name: "Client" } },
    }],
  }));
  render(<DashboardView />);
  expect(await screen.findByRole("link", { name: /Audit escrow/ })).toHaveAttribute("href", "/issues/issue");
  expect(screen.queryByText("No tasks here yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Applications" }));
  expect(screen.getByRole("link", { name: /Audit escrow/ })).toBeInTheDocument();
});

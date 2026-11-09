import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateIssueForm } from "@/components/issues/create-issue-form";
import { useAuthStore } from "@/lib/store/use-auth-store";

const { request } = vi.hoisted(() => ({ request: vi.fn(async (_query: string) => ({ tokens: [{ id: "token", symbol: "USDC", name: "USD", decimals: 6, chainId: 1 }] })) }));
vi.mock("@/lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("@/lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light", t: (key: string) => key }) }));

describe("create issue validation", () => {
  it("shows field errors when invalid fields are submitted or blurred", async () => {
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    render(<CreateIssueForm />);
    await waitFor(() => expect(screen.getByRole("button", { name: "publishBounty" })).not.toBeDisabled());
    fireEvent.invalid(screen.getByLabelText("titleLabel"));
    fireEvent.blur(screen.getByLabelText("descriptionLabel"));
    expect(screen.getByText("Title must contain 10–120 characters.")).toBeTruthy();
    expect(screen.getByText("Scope must contain 30–5000 characters.")).toBeTruthy();
  });
  it.each(["          ", "  short  "])("rejects a title that is too short after trimming: %j", async (title) => {
    useAuthStore.setState({ user: { id: "u", role: "CLIENT" } as never, status: "authenticated" });
    render(<CreateIssueForm />);
    await waitFor(() => expect(screen.getByRole("button", { name: "publishBounty" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("titleLabel"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("descriptionLabel"), { target: { value: "A sufficiently detailed scope for this bounty." } });
    fireEvent.submit(screen.getByRole("button", { name: "publishBounty" }).closest("form")!);
    expect(screen.getByText("Title must contain 10–120 characters.")).toBeTruthy();
    expect(request.mock.calls.every(([query]) => !query.includes("mutation CreateIssue"))).toBe(true);
  });
});

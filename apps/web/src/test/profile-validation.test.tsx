import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileView } from "@/components/profile/profile-view";
import { GraphQLRequestError } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/graphql-client", async (importOriginal) => ({ ...(await importOriginal<object>()), graphqlRequest: request }));
vi.mock("@/lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light", t: (key: string) => key }) }));

describe("profile validation", () => {
  it("shows the server field error without losing the entered value", async () => {
    const user = { id: "u", role: "DEVELOPER", walletAddress: "0x123", reputationScore: 0, completedTaskCount: 0 };
    useAuthStore.setState({ user: user as never, status: "authenticated" });
    request.mockImplementation(async (query: string) => {
      if (query.includes("MyProfile")) return { me: { ...user, skills: [], attestations: [] } };
      throw new GraphQLRequestError({ message: "invalid", extensions: { code: "BAD_USER_INPUT", details: { fieldErrors: { avatar: ["Avatar URL must use HTTP or HTTPS"] } } } });
    });
    render(<ProfileView />);
    const avatar = await screen.findByLabelText("avatarUrl");
    fireEvent.change(avatar, { target: { value: "ftp://example.com/image" } });
    fireEvent.click(screen.getByRole("button", { name: /saveProfile/ }));
    await waitFor(() => expect(screen.getByText("Avatar URL must use HTTP or HTTPS")).toBeTruthy());
    expect((avatar as HTMLInputElement).value).toBe("ftp://example.com/image");
  });
  it("hides the previous profile and disables saving when the next account cannot load", async () => {
    const user = { id: "a", role: "DEVELOPER", walletAddress: "0x123", reputationScore: 0, completedTaskCount: 0 };
    useAuthStore.setState({ user: user as never, status: "authenticated" });
    request.mockResolvedValueOnce({ me: { ...user, name: "Account A", skills: [], attestations: [] } });
    render(<ProfileView />);
    await screen.findByDisplayValue("Account A");
    request.mockRejectedValueOnce(new Error("Profile unavailable"));
    act(() => useAuthStore.setState({ user: { ...user, id: "b", walletAddress: "0x456" } as never }));
    await screen.findByText("Profile unavailable");
    expect(screen.queryByDisplayValue("Account A")).toBeNull();
    expect(screen.queryByRole("button", { name: /saveProfile/ })).toBeNull();
  });
});

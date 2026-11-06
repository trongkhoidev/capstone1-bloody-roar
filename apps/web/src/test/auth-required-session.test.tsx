import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/use-auth-store";

vi.mock("@/components/auth/connect-modal", () => ({ ConnectModal: () => null }));
afterEach(() => vi.restoreAllMocks());

it("offers session retry instead of wallet sign-in when verification failed", async () => {
  useAuthStore.setState({ user: null, status: "session_error" });
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: { user: null } });
  render(<AuthRequiredPanel title="Sign in" description="Connect" />);
  expect(screen.queryByText("Connect wallet to continue")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText("Connect wallet to continue")).toBeTruthy());
});

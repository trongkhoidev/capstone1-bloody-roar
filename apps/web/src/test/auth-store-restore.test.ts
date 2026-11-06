import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/lib/store/use-auth-store";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("restoreSession", () => {
  it("retains the user and coalesces requests when the session service fails", async () => {
    vi.useFakeTimers();
    const user = { id: "user" } as AuthUser;
    useAuthStore.setState({ user, status: "idle" });
    const get = vi.spyOn(apiClient, "get").mockRejectedValue(new Error("503"));
    const first = useAuthStore.getState().restoreSession();
    const second = useAuthStore.getState().restoreSession();
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(get).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().status).toBe("idle");
  });
});

// apps/web/src/test/use-auth-store.test.ts
// Vitest Unit Tests for useAuthStore & SIWE Authentication Handshake
// Trâm (Test Engineer) — Sprint 1 (S2-TST-04 / S1-AUTH-08)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createLoginMessage, useAuthStore } from "../lib/store/use-auth-store";
import type { AuthUser } from "../lib/store/use-auth-store";
import { apiClient } from "../lib/api-client";

describe("useAuthStore", () => {
  const mockUser: AuthUser = {
    id: "usr-123",
    walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    role: "DEVELOPER",
    name: "Trâm Test",
    avatar: null,
    bio: "Test engineer & UI/UX designer",
    skills: ["solidity", "vitest", "react"],
    location: "VN",
    reputationScore: 120,
    completedTaskCount: 5,
    isGithubVerified: true,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ user: null, status: "idle", error: null });
  });

  it("formats every Thirdweb SIWE field, including Not Before and Resources", () => {
    const message = createLoginMessage({
      domain: "localhost:4000",
      address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      statement: "Please ensure that the domain above matches the URL of the current website.",
      version: "1",
      uri: "http://localhost:4000",
      chain_id: "84532",
      nonce: "nonce-123",
      issued_at: "2026-09-12T00:00:00.000Z",
      expiration_time: "2026-09-12T00:10:00.000Z",
      invalid_before: "2026-09-11T23:50:00.000Z",
      resources: ["https://example.test/task/1"],
    });

    expect(message).toContain("Please ensure that the domain above matches the URL of the current website.\n\nURI: http://localhost:4000");
    expect(message).toContain("Not Before: 2026-09-11T23:50:00.000Z");
    expect(message).toContain("Resources:\n- https://example.test/task/1");
  });

  it("should initialize with default unauthenticated state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
  });

  it("should set authenticated state upon calling setAuth", () => {
    useAuthStore.getState().setAuth(mockUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.status).toBe("authenticated");
    expect(state.error).toBeNull();
  });

  it("should clear user and status on logout", () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({ data: {} } as never);
    useAuthStore.getState().setAuth(mockUser);

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.status).toBe("idle");
  });

  it("should handle successful SIWE loginWithSignature flow", async () => {
    const mockPayload = {
      domain: "localhost:4000",
      address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      nonce: "mock-nonce-123",
      issued_at: new Date().toISOString(),
    };
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: mockPayload } as never);
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({ data: { user: mockUser } } as never);

    const mockSigner = vi.fn().mockResolvedValue("0xmocksignature12345");

    const result = await useAuthStore
      .getState()
      .loginWithSignature(mockUser.walletAddress, mockSigner);

    expect(result).toBe(true);
    expect(mockSigner).toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledWith("/api/auth/nonce", {
      params: { address: mockUser.walletAddress },
    });
    expect(apiClient.post).toHaveBeenCalledWith("/api/auth/login", {
      payload: mockPayload,
      signature: "0xmocksignature12345",
    });
    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user?.walletAddress).toBe(mockUser.walletAddress);
  });

  it("should handle user rejection gracefully without crashing", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { nonce: "test-nonce" },
    } as never);

    // Signer throws rejection
    const mockSigner = vi
      .fn()
      .mockRejectedValue(new Error("User rejected the request."));

    const result = await useAuthStore
      .getState()
      .loginWithSignature("0x123", mockSigner);

    expect(result).toBe(false);
    const state = useAuthStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("từ chối ký");
  });
});

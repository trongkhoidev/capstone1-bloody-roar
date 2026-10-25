// apps/web/src/test/use-auth-store.test.ts
// Vitest Unit Tests for useAuthStore & SIWE Authentication Handshake
// Trâm (Test Engineer) — Sprint 1 (S2-TST-04 / S1-AUTH-08)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore, AuthUser } from "../lib/store/use-auth-store";

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
    useAuthStore.getState().logout();
    vi.restoreAllMocks();
  });

  it("should initialize with default unauthenticated state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
  });

  it("should set authenticated state upon calling setAuth", () => {
    useAuthStore.getState().setAuth("mock-jwt-token-xyz", mockUser);

    const state = useAuthStore.getState();
    expect(state.token).toBe("mock-jwt-token-xyz");
    expect(state.user).toEqual(mockUser);
    expect(state.status).toBe("authenticated");
    expect(state.error).toBeNull();
  });

  it("should clear user, token, and status on logout", () => {
    useAuthStore.getState().setAuth("mock-jwt-token-xyz", mockUser);
    expect(useAuthStore.getState().token).toBe("mock-jwt-token-xyz");

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.status).toBe("idle");
  });

  it("should handle successful SIWE loginWithSignature flow", async () => {
    // 1. Mock fetch for nonce & login
    const mockPayload = {
      domain: "localhost:3000",
      address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      nonce: "mock-nonce-123",
      issued_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/auth/nonce")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockPayload),
        });
      }
      if (url.includes("/api/auth/login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              token: "verified-jwt-token",
              user: mockUser,
            }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    const mockSigner = vi.fn().mockResolvedValue("0xmocksignature12345");

    const result = await useAuthStore
      .getState()
      .loginWithSignature(mockUser.walletAddress, mockSigner);

    expect(result).toBe(true);
    expect(mockSigner).toHaveBeenCalled();
    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.token).toBe("verified-jwt-token");
    expect(state.user?.walletAddress).toBe(mockUser.walletAddress);
  });

  it("should handle user rejection gracefully without crashing", async () => {
    // Mock nonce fetch success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonce: "test-nonce" }),
    });

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
    expect(state.token).toBeNull();
  });
});

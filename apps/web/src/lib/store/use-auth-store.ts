// apps/web/src/lib/store/use-auth-store.ts
// Zustand Authentication Store — SIWE (Sign-In with Ethereum) & User Session
// Trâm (UI/UX Designer & Test Engineer) — Sprint 1 (S1-AUTH-08)

import { create } from "zustand";
import { apiClient, getApiErrorMessage } from "@/lib/api-client";
import { tryChecksumAddress } from "@/lib/auth/address";
import { createLoginMessage, type SiweLoginPayload } from "@/lib/auth/siwe";

export { createLoginMessage } from "@/lib/auth/siwe";

export interface AuthUser {
  id: string;
  walletAddress: string;
  role: "DEVELOPER" | "CLIENT" | "ADMIN";
  name: string | null;
  avatar: string | null;
  bio: string | null;
  skills: string[];
  location: string | null;
  reputationScore: number;
  completedTaskCount: number;
  isGithubVerified: boolean;
  createdAt: string;
}

export type AuthStatus =
  | "idle"
  | "restoring"
  | "connecting"
  | "requesting_nonce"
  | "signing"
  | "verifying"
  | "authenticated"
  | "error";

type LoginPayload = SiweLoginPayload;

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;

  // Actions
  setAuth: (user: AuthUser) => void;
  setStatus: (status: AuthStatus, error?: string | null) => void;
  clearError: () => void;
  logout: () => void;
  restoreSession: () => Promise<void>;

  // Full SIWE flow helper
  loginWithSignature: (
    walletAddress: string,
    signerFn: (message: string) => Promise<string>
  ) => Promise<boolean>;
}

let restorePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
    (set, get) => ({
      user: null,
      status: "idle",
      error: null,

      setAuth: (user: AuthUser) => {
        set({
          user,
          status: "authenticated",
          error: null,
        });
      },

      setStatus: (status: AuthStatus, error: string | null = null) => {
        set({ status, error: error ?? null });
      },

      clearError: () => {
        set({ error: null, status: get().user ? "authenticated" : "idle" });
      },

      logout: () => {
        if (get().user) {
          void apiClient.post("/api/auth/logout").catch(() => undefined);
        }
        set({
          user: null,
          status: "idle",
          error: null,
        });
      },

      restoreSession: () => {
        if (restorePromise) return restorePromise;
        if (get().status === "authenticated") return Promise.resolve();
        set({ status: "restoring", error: null });
        restorePromise = (async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const { data } = await apiClient.get<{ user: AuthUser | null }>("/api/auth/session");
              if (get().status === "restoring") set({ user: data.user, status: data.user ? "authenticated" : "idle", error: null });
              return;
            } catch {
              if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
          if (get().status === "restoring") set({ status: "idle", error: null });
        })().finally(() => { restorePromise = null; });
        return restorePromise;
      },

      loginWithSignature: async (
        walletAddress: string,
        signerFn: (message: string) => Promise<string>
      ): Promise<boolean> => {
        try {
          // 1. Fetch Nonce from Backend
          set({ status: "requesting_nonce", error: null });
          const { data: loginPayload } = await apiClient.get<LoginPayload>("/api/auth/nonce", {
            params: { address: walletAddress },
          });
          const checksumAddress = tryChecksumAddress(
            loginPayload.address || walletAddress,
          );
          if (checksumAddress) {
            loginPayload.address = checksumAddress;
          }

          // 2. Format SIWE / Thirdweb EIP-4361 message to sign
          set({ status: "signing" });
          
          const messageToSign = createLoginMessage(loginPayload);

          const signature = await signerFn(messageToSign);

          // 3. Verify on Backend
          set({ status: "verifying" });
          const { data } = await apiClient.post<{ user?: AuthUser }>("/api/auth/login", {
              payload: loginPayload,
              signature,
          });
          const { user } = data;

          if (!user) {
            throw new Error("Dữ liệu phản hồi xác thực không hợp lệ.");
          }

          set({
            user,
            status: "authenticated",
            error: null,
          });

          return true;
        } catch (err: unknown) {
          const message = getApiErrorMessage(err, "Đã xảy ra lỗi trong quá trình đăng nhập.");
          const errorMessage =
            message.includes("User rejected") ||
            message.includes("ACTION_REJECTED")
              ? "Bạn đã từ chối ký xác thực trong ví."
              : message || "Đã xảy ra lỗi trong quá trình đăng nhập.";

          set({
            status: "error",
            error: errorMessage,
          });
          return false;
        }
      },
    })
);

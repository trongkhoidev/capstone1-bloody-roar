// apps/web/src/lib/store/use-auth-store.ts
// Zustand Authentication Store — SIWE (Sign-In with Ethereum) & User Session
// Trâm (UI/UX Designer & Test Engineer) — Sprint 1 (S1-AUTH-08)

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  | "connecting"
  | "requesting_nonce"
  | "signing"
  | "verifying"
  | "authenticated"
  | "error";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;

  // Actions
  setAuth: (token: string, user: AuthUser) => void;
  setStatus: (status: AuthStatus, error?: string | null) => void;
  clearError: () => void;
  logout: () => void;

  // Full SIWE flow helper
  loginWithSignature: (
    walletAddress: string,
    signerFn: (message: string) => Promise<string>
  ) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      status: "idle",
      error: null,

      setAuth: (token: string, user: AuthUser) => {
        set({
          token,
          user,
          status: "authenticated",
          error: null,
        });
      },

      setStatus: (status: AuthStatus, error: string | null = null) => {
        set({ status, error: error ?? null });
      },

      clearError: () => {
        set({ error: null, status: get().token ? "authenticated" : "idle" });
      },

      logout: () => {
        // Clear local cookies if needed
        if (typeof document !== "undefined") {
          document.cookie =
            "bloody_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        }
        set({
          user: null,
          token: null,
          status: "idle",
          error: null,
        });
      },

      loginWithSignature: async (
        walletAddress: string,
        signerFn: (message: string) => Promise<string>
      ): Promise<boolean> => {
        const normalizedAddress = walletAddress.toLowerCase();
        try {
          // 1. Fetch Nonce from Backend
          set({ status: "requesting_nonce", error: null });
          const nonceRes = await fetch(
            `/api/auth/nonce?address=${normalizedAddress}`
          );

          if (!nonceRes.ok) {
            throw new Error("Không thể lấy nonce xác thực từ máy chủ.");
          }

          const loginPayload = await nonceRes.json();

          // 2. Format SIWE / Thirdweb EIP-4361 message to sign
          set({ status: "signing" });
          
          // Construct SIWE message body from Thirdweb payload format
          const domain = loginPayload.domain || (typeof window !== "undefined" ? window.location.host : "localhost:3000");
          const uri = loginPayload.uri || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
          const statement =
            loginPayload.statement ||
            "Sign in with Ethereum to Bloody-Roar Bounty Marketplace.";
          const nonce = loginPayload.nonce;
          const issuedAt = loginPayload.issued_at || new Date().toISOString();
          const expirationTime = loginPayload.expiration_time;

          let messageToSign = `${domain} wants you to sign in with your Ethereum account:\n${normalizedAddress}\n\n${statement}\n\nURI: ${uri}\nVersion: 1\nChain ID: ${loginPayload.chain_id || 84532}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
          if (expirationTime) {
            messageToSign += `\nExpiration Time: ${expirationTime}`;
          }

          const signature = await signerFn(messageToSign);

          // 3. Verify on Backend
          set({ status: "verifying" });
          const loginRes = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payload: loginPayload,
              signature,
            }),
          });

          if (!loginRes.ok) {
            const errData = await loginRes.json().catch(() => ({}));
            throw new Error(
              errData.error || `Xác thực thất bại (HTTP ${loginRes.status})`
            );
          }

          const data = await loginRes.json();
          const { token, user } = data;

          if (!token || !user) {
            throw new Error("Dữ liệu phản hồi xác thực không hợp lệ.");
          }

          // Save token in cookie for Next.js SSR / API requests
          if (typeof document !== "undefined") {
            document.cookie = `bloody_token=${token}; path=/; max-age=604800; SameSite=Lax`;
          }

          set({
            token,
            user,
            status: "authenticated",
            error: null,
          });

          return true;
        } catch (err: any) {
          const errorMessage =
            err?.message?.includes("User rejected") ||
            err?.message?.includes("ACTION_REJECTED")
              ? "Bạn đã từ chối ký xác thực trong ví."
              : err?.message || "Đã xảy ra lỗi trong quá trình đăng nhập.";

          set({
            status: "error",
            error: errorMessage,
          });
          return false;
        }
      },
    }),
    {
      name: "bloody-roar-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);

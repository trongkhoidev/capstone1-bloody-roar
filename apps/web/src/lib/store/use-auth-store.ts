// apps/web/src/lib/store/use-auth-store.ts
// Zustand Authentication Store — SIWE (Sign-In with Ethereum) & User Session
// Trâm (UI/UX Designer & Test Engineer) — Sprint 1 (S1-AUTH-08)

import { create } from "zustand";

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

type LoginPayload = {
  domain: string;
  address: string;
  statement?: string;
  version: string;
  uri?: string;
  chain_id?: string;
  nonce: string;
  issued_at: string;
  expiration_time: string;
  invalid_before?: string;
  resources?: string[];
};

/** Mirrors Thirdweb Auth's EIP-4361/CAIP-122 message formatter. */
export function createLoginMessage(payload: LoginPayload): string {
  const header = `${payload.domain} wants you to sign in with your Ethereum account:`;
  let prefix = `${header}\n${payload.address}\n\n${payload.statement ?? ""}`;
  if (payload.statement) prefix += "\n";

  const suffix: string[] = [];
  if (payload.uri) suffix.push(`URI: ${payload.uri}`);
  suffix.push(`Version: ${payload.version}`);
  if (payload.chain_id) suffix.push(`Chain ID: ${payload.chain_id}`);
  suffix.push(`Nonce: ${payload.nonce}`);
  suffix.push(`Issued At: ${payload.issued_at}`);
  suffix.push(`Expiration Time: ${payload.expiration_time}`);
  if (payload.invalid_before) suffix.push(`Not Before: ${payload.invalid_before}`);
  if (payload.resources?.length) suffix.push(["Resources:", ...payload.resources.map((resource) => `- ${resource}`)].join("\n"));
  return `${prefix}\n${suffix.join("\n")}`;
}

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
          void fetch("/api/auth/logout", {
            method: "POST",
          }).catch(() => undefined);
        }
        set({
          user: null,
          status: "idle",
          error: null,
        });
      },

      restoreSession: async () => {
        if (get().status === "authenticated") return;
        set({ status: "restoring", error: null });
        try {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          if (!response.ok) {
            set({ user: null, status: "idle", error: null });
            return;
          }
          const data = await response.json() as { user?: AuthUser };
          set({ user: data.user ?? null, status: data.user ? "authenticated" : "idle", error: null });
        } catch {
          set({ user: null, status: "idle", error: null });
        }
      },

      loginWithSignature: async (
        walletAddress: string,
        signerFn: (message: string) => Promise<string>
      ): Promise<boolean> => {
        try {
          // 1. Fetch Nonce from Backend
          set({ status: "requesting_nonce", error: null });
          const nonceRes = await fetch(
            `/api/auth/nonce?address=${encodeURIComponent(walletAddress)}`
          );

          if (!nonceRes.ok) {
            throw new Error("Không thể lấy nonce xác thực từ máy chủ.");
          }

          const loginPayload = await nonceRes.json();

          // 2. Format SIWE / Thirdweb EIP-4361 message to sign
          set({ status: "signing" });
          
          const messageToSign = createLoginMessage(loginPayload as LoginPayload);

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
          const message = err instanceof Error ? err.message : String(err ?? "");
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

// apps/web/src/components/auth/connect-modal.tsx
// Trâm (UI/UX Designer & Test Engineer) — Connect Wallet & Social Login Modal (S1-AUTH-08)

"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../lib/store/use-auth-store";
import {
  WALLET_OPTIONS,
  hasInjectedProvider,
  connectInjectedWallet,
  ensureBaseSepolia,
  signMessageWithInjected,
} from "../../lib/web3/client";
import type { WalletOption } from "../../lib/web3/client";
import { useUiPreferences } from "@/lib/ui-preferences";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectModal({ isOpen, onClose }: ConnectModalProps) {
  const [activeTab, setActiveTab] = useState<"web3" | "social">("web3");
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useUiPreferences();

  const { status, error, loginWithSignature, clearError, setStatus } = useAuthStore();

  if (!isOpen) return null;

  const handleWalletSelect = async (option: WalletOption) => {
    clearError();

    if (option.type === "injected" || option.type === "coinbase") {
      try {
        if (!hasInjectedProvider(option.id)) {
          alert(
            option.id === "coinbase"
              ? "Không tìm thấy Coinbase Wallet Extension."
              : option.id === "metamask"
                ? "Không tìm thấy MetaMask Extension."
                : "Không tìm thấy ví Web3 trên trình duyệt! Vui lòng cài đặt MetaMask hoặc Rabby extension."
          );
          return;
        }

        const address = await connectInjectedWallet(option.id);
        await ensureBaseSepolia(option.id);
        const success = await loginWithSignature(address, (msg) =>
          signMessageWithInjected(address, msg, option.id)
        );

        if (success) {
          onClose();
          // Preserve the current internal URL without forcing every route that
          // renders the global navbar into client-side rendering at build time.
          router.replace(`${pathname}${window.location.search}`);
          router.refresh();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Không thể kết nối ví. Vui lòng thử lại.";
        setStatus("error", message);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      data-testid="connect-modal-backdrop"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-lg)] overflow-hidden"
        data-testid="connect-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[hsl(var(--border)/0.5)]">
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {t("signInTitle")}
            </h2>
            <p className="text-xs text-[hsl(var(--foreground-muted))] mt-0.5">
              {t("signInWalletDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            data-testid="close-modal-btn"
          >
            ✕
          </button>
        </div>

        {/* Status Indicator */}
        {status === "signing" && (
          <div className="my-4 p-3 rounded-lg border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.1)] flex items-center gap-3 animate-fade-in">
            <span className="h-3 w-3 rounded-full bg-[hsl(var(--warning))] animate-ping" />
            <div className="text-xs text-[hsl(var(--warning))] font-medium">
              Vui lòng xác nhận chữ ký SIWE trong cửa sổ ví của bạn...
            </div>
          </div>
        )}

        {status === "requesting_nonce" && (
          <div className="my-4 p-3 rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] flex items-center gap-3 animate-fade-in">
            <span className="h-3 w-3 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
            <div className="text-xs text-[hsl(var(--foreground))] font-medium">
              Đang lấy mã Nonce bảo mật từ máy chủ...
            </div>
          </div>
        )}

        {status === "verifying" && (
          <div className="my-4 p-3 rounded-lg border border-[hsl(var(--accent)/0.4)] bg-[hsl(var(--accent)/0.1)] flex items-center gap-3 animate-fade-in">
            <span className="h-3 w-3 rounded-full bg-[hsl(var(--accent))] animate-pulse" />
            <div className="text-xs text-[hsl(var(--accent))] font-medium">
              Đang xác minh chữ ký & khởi tạo phiên đăng nhập...
            </div>
          </div>
        )}

        {status === "authenticated" && (
          <div className="my-4 p-3 rounded-lg border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] flex items-center gap-3 animate-fade-in">
            <span className="text-sm">✓</span>
            <div className="text-xs text-[hsl(var(--success))] font-medium">
              Đăng nhập thành công! Đang chuyển hướng...
            </div>
          </div>
        )}

        {error && (
          <div className="my-4 p-3 rounded-lg border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.1)] text-xs text-[hsl(var(--destructive))] flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-xs underline hover:no-underline ml-2"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-2 my-4 p-1 rounded-lg bg-[hsl(var(--background-secondary))]">
          <button
            type="button"
            onClick={() => setActiveTab("web3")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "web3"
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
            }`}
            data-testid="tab-web3-btn"
          >
            {t("web3Wallets")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("social")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "social"
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
            }`}
            data-testid="tab-social-btn"
          >
            {t("linkedAccounts")}
          </button>
        </div>

        {/* Tab 1: Web3 Wallets */}
        {activeTab === "web3" && (
          <div className="space-y-2.5">
            {WALLET_OPTIONS.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => handleWalletSelect(wallet)}
                disabled={status === "signing" || status === "verifying"}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] hover:bg-[hsl(var(--background-tertiary))] hover:border-[hsl(var(--primary)/0.4)] transition-all text-left disabled:opacity-50 group active:scale-[0.99]"
                data-testid={`wallet-btn-${wallet.id}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {wallet.icon}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {wallet.name}
                    </div>
                    <div className="text-[11px] text-[hsl(var(--foreground-subtle))]">
                      {wallet.id === "metamask"
                        ? "Phổ biến nhất · Base Sepolia"
                        : wallet.id === "coinbase"
                        ? "Coinbase browser extension"
                        : "Tương thích EVM Wallet"}
                    </div>
                  </div>
                </div>
                <span className="text-[hsl(var(--foreground-subtle))] group-hover:text-[hsl(var(--primary))] group-hover:translate-x-1 transition-all">
                  →
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Social providers are account linking, not wallet authentication. */}
        {activeTab === "social" && (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-4 text-sm leading-6 text-[hsl(var(--foreground-muted))]">
            {t("socialLoginUnavailable")}
          </div>
        )}

        {/* Network & Security Note */}
        <div className="mt-5 pt-4 border-t border-[hsl(var(--border)/0.5)] text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--foreground-subtle))]">
            <span>🛡️</span>
            <span>Chữ ký SIWE chỉ xác minh quyền sở hữu ví, không tạo giao dịch hay trừ tiền</span>
          </div>
        </div>
      </div>
    </div>
  );
}

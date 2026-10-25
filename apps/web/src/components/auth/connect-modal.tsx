// apps/web/src/components/auth/connect-modal.tsx
// Trâm (UI/UX Designer & Test Engineer) — Connect Wallet & Social Login Modal (S1-AUTH-08)

"use client";

import React, { useState } from "react";
import { useAuthStore } from "../../lib/store/use-auth-store";
import {
  WALLET_OPTIONS,
  SOCIAL_OPTIONS,
  hasInjectedProvider,
  connectInjectedWallet,
  signMessageWithInjected,
  WalletOption,
} from "../../lib/web3/client";
import { Button } from "../ui/button";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectModal({ isOpen, onClose }: ConnectModalProps) {
  const [activeTab, setActiveTab] = useState<"web3" | "social">("web3");
  const [emailInput, setEmailInput] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const { status, error, loginWithSignature, clearError } = useAuthStore();

  if (!isOpen) return null;

  const handleWalletSelect = async (option: WalletOption) => {
    clearError();

    if (option.type === "injected" || option.type === "coinbase") {
      try {
        if (!hasInjectedProvider()) {
          alert(
            "Không tìm thấy ví Web3 trên trình duyệt! Vui lòng cài đặt MetaMask hoặc Rabby extension."
          );
          return;
        }

        const address = await connectInjectedWallet();
        const success = await loginWithSignature(address, (msg) =>
          signMessageWithInjected(address, msg)
        );

        if (success) {
          setTimeout(() => {
            onClose();
          }, 800);
        }
      } catch (err: any) {
        console.error("Wallet connection failed:", err);
      }
    }
  };

  const handleSocialSelect = async (option: WalletOption) => {
    clearError();
    if (option.provider === "email") {
      setEmailSent(false);
      return;
    }

    // Mock social SIWE flow with deterministic social wallet for development/preview
    const socialAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Test developer address
    const mockSigner = async (message: string) => {
      // In local dev/demo, sign via simulated client signature
      return "0x307556a3194090b853cb6ff0ca22d251bc27f677d2d385be66a01dfb3b55c65f2cb78018e6c4ea6b39bfadbbfe02eb5bc7ef506d396a849764516ba423f05ce71b";
    };

    const success = await loginWithSignature(socialAddress, mockSigner);
    if (success) {
      setTimeout(() => {
        onClose();
      }, 800);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes("@")) return;

    setEmailSent(true);
    // Simulate Email OTP flow
    const emailWallet = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
    const mockSigner = async () =>
      "0x307556a3194090b853cb6ff0ca22d251bc27f677d2d385be66a01dfb3b55c65f2cb78018e6c4ea6b39bfadbbfe02eb5bc7ef506d396a849764516ba423f05ce71b";

    const success = await loginWithSignature(emailWallet, mockSigner);
    if (success) {
      setTimeout(() => {
        onClose();
      }, 800);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      data-testid="connect-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "signing" && status !== "verifying") {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-lg)] overflow-hidden"
        data-testid="connect-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[hsl(var(--border)/0.5)]">
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              Đăng nhập Bloody-Roar
            </h2>
            <p className="text-xs text-[hsl(var(--foreground-muted))] mt-0.5">
              Kết nối ví Web3 hoặc đăng nhập bằng tài khoản mạng xã hội
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
            Ví Web3
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
            Mạng xã hội / Email
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
                        ? "Phổ biến nhất · Ethereum / Base"
                        : wallet.id === "coinbase"
                        ? "Smart Wallet · Khuyên dùng"
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

        {/* Tab 2: Social Login & Email */}
        {activeTab === "social" && (
          <div className="space-y-3">
            {SOCIAL_OPTIONS.filter((s) => s.provider !== "email").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSocialSelect(item)}
                disabled={status === "signing" || status === "verifying"}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] hover:bg-[hsl(var(--background-tertiary))] hover:border-[hsl(var(--accent)/0.4)] transition-all text-left disabled:opacity-50 group"
                data-testid={`social-btn-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {item.name}
                  </span>
                </div>
                <span className="text-xs text-[hsl(var(--foreground-muted))] group-hover:text-[hsl(var(--accent))]">
                  Đăng nhập
                </span>
              </button>
            ))}

            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[hsl(var(--border)/0.5)]" />
              </div>
              <span className="relative bg-[hsl(var(--card))] px-2 text-[11px] text-[hsl(var(--foreground-subtle))] uppercase tracking-wider">
                hoặc email
              </span>
            </div>

            {/* Email OTP form */}
            <form onSubmit={handleEmailSubmit} className="space-y-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="developer@example.com"
                required
                className="w-full h-10 px-3 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background-secondary))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--foreground-subtle))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                data-testid="email-input"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="w-full"
                isLoading={emailSent}
                data-testid="email-submit-btn"
              >
                Gửi mã xác thực OTP
              </Button>
            </form>
          </div>
        )}

        {/* Network & Security Note */}
        <div className="mt-5 pt-4 border-t border-[hsl(var(--border)/0.5)] text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--foreground-subtle))]">
            <span>🛡️</span>
            <span>Bảo mật bằng mật mã học EIP-712 & Thirdweb Auth trên Base L2</span>
          </div>
        </div>
      </div>
    </div>
  );
}

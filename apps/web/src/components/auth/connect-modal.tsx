// apps/web/src/components/auth/connect-modal.tsx
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
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useUiPreferences();

  const { status, error, loginWithSignature, clearError, setStatus } = useAuthStore();

  if (!isOpen) return null;

  const handleWalletSelect = async (option: WalletOption) => {
    clearError();
    setSelectedWallet(option);

    if (option.type === "injected" || option.type === "coinbase") {
      try {
        if (!hasInjectedProvider(option.id)) {
          alert(
            option.id === "coinbase"
              ? "Không tìm thấy Coinbase Wallet Extension."
              : option.id === "metamask"
              ? "Không tìm thấy MetaMask Extension."
              : "Không tìm thấy ví Web3 trên trình duyệt! Vui lòng cài đặt extension."
          );
          setSelectedWallet(null);
          return;
        }

        const address = await connectInjectedWallet(option.id);
        await ensureBaseSepolia(option.id);
        const success = await loginWithSignature(address, (msg) =>
          signMessageWithInjected(address, msg, option.id)
        );

        if (success) {
          onClose();
          router.replace(`${pathname}${window.location.search}`);
          router.refresh();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Không thể kết nối ví. Vui lòng thử lại.";
        setStatus("error", message);
      }
    }
  };

  const handleBack = () => {
    clearError();
    setSelectedWallet(null);
    setStatus("idle");
  };

  // Cờ kiểm tra xem có đang trong quá trình xử lý không
  const isProcessing = status === "signing" || status === "requesting_nonce" || status === "verifying" || status === "authenticated";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      data-testid="connect-modal-backdrop"
    >
      <div
        className="relative w-full max-w-md h-auto min-h-[420px] flex flex-col rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)] overflow-hidden transition-all duration-300"
        data-testid="connect-modal"
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-6 pb-4 border-b border-[hsl(var(--border)/0.5)]">
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {isProcessing && selectedWallet ? "Đang kết nối..." : t("signInTitle")}
            </h2>
            <p className="text-xs text-[hsl(var(--foreground-muted))] mt-0.5">
              {isProcessing ? "Vui lòng hoàn thành thao tác trên ví" : t("signInWalletDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === "authenticated"}
            className="p-1.5 rounded-md text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Bố cục nội dung chính - Giữ chiều cao ổn định */}
        <div className="flex-1 p-6 relative flex flex-col">
          
          {/* MÀN HÌNH CHỜ / LỖI (Khi đang kết nối) */}
          {(isProcessing || error) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in h-full py-4">
              {status === "authenticated" ? (
                <div className="h-16 w-16 mb-4 rounded-full bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] flex items-center justify-center text-3xl">
                  ✓
                </div>
              ) : error ? (
                <div className="h-16 w-16 mb-4 rounded-full bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))] flex items-center justify-center text-3xl">
                  ✕
                </div>
              ) : (
                <div className="relative mb-6">
                  <div className="h-16 w-16 text-4xl flex items-center justify-center animate-pulse">
                    {selectedWallet?.icon || "🦊"}
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-[hsl(var(--card))] bg-[hsl(var(--warning))] animate-ping" />
                </div>
              )}

              <h3 className="text-[hsl(var(--foreground))] font-semibold mb-2">
                {status === "signing" && "Yêu cầu chữ ký (SIWE)"}
                {status === "requesting_nonce" && "Đang lấy mã Nonce..."}
                {status === "verifying" && "Đang xác minh..."}
                {status === "authenticated" && "Đăng nhập thành công!"}
                {error && "Kết nối thất bại"}
              </h3>
              
              <p className="text-sm text-[hsl(var(--foreground-muted))] max-w-[280px]">
                {status === "signing" && `Vui lòng mở ${selectedWallet?.name || "ví"} của bạn để xác nhận yêu cầu đăng nhập.`}
                {status === "requesting_nonce" && "Đang kết nối an toàn với máy chủ."}
                {status === "verifying" && "Kiểm tra chữ ký và khởi tạo phiên."}
                {error && error}
              </p>

              {error && (
                <button
                  onClick={handleBack}
                  className="mt-6 px-6 py-2 text-sm font-medium rounded-lg bg-[hsl(var(--background-secondary))] hover:bg-[hsl(var(--background-tertiary))] text-[hsl(var(--foreground))] transition-colors"
                >
                  Quay lại chọn ví
                </button>
              )}
            </div>
          ) : (
            
            /* MÀN HÌNH CHỌN VÍ (Khi chưa kết nối) */
            <div className="flex-1 flex flex-col animate-fade-in">
              {/* Tab Switcher */}
              <div className="flex gap-2 mb-4 p-1 rounded-lg bg-[hsl(var(--background-secondary))]">
                <button
                  onClick={() => setActiveTab("web3")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    activeTab === "web3"
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                      : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  {t("web3Wallets")}
                </button>
                <button
                  onClick={() => setActiveTab("social")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    activeTab === "social"
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                      : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  {t("linkedAccounts")}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 -mr-1">
                {activeTab === "web3" && (
                  <div className="space-y-2.5 pb-2">
                    {WALLET_OPTIONS.map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => handleWalletSelect(wallet)}
                        className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] hover:bg-[hsl(var(--background-tertiary))] hover:border-[hsl(var(--primary)/0.4)] transition-all text-left group active:scale-[0.99]"
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

                {activeTab === "social" && (
                  <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-4 text-sm leading-6 text-[hsl(var(--foreground-muted))]">
                    {t("socialLoginUnavailable")}
                  </div>
                )}
              </div>

              {/* Security Note */}
              <div className="mt-4 pt-4 border-t border-[hsl(var(--border)/0.5)] text-center">
                <div className="inline-flex items-center justify-center gap-1.5 text-[11px] text-[hsl(var(--foreground-subtle))]">
                  <span>🛡️</span>
                  <span>Chỉ xác minh quyền sở hữu, không trừ tiền</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
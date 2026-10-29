// apps/web/src/components/auth/connect-modal.tsx
"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, AlertCircle } from "lucide-react";
import { WolfLogo } from "@/components/ui/wolf-logo";
import { useAuthStore } from "../../lib/store/use-auth-store";
import {
  WALLET_OPTIONS,
  hasInjectedProvider,
  connectInjectedWallet,
  ensureBaseSepolia,
  signMessageWithInjected,
} from "../../lib/web3/client";
import type { WalletOption } from "../../lib/web3/client";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectModal({ isOpen, onClose }: ConnectModalProps) {
  const [activeTab, setActiveTab] = useState<"web3" | "social">("web3");
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);

  const router = useRouter();
  const pathname = usePathname();

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
              ? "Coinbase Wallet Extension not detected."
              : option.id === "metamask"
              ? "MetaMask Extension not detected."
              : "No Web3 browser wallet detected. Please install an extension."
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
        const message = err instanceof Error ? err.message : "Unable to connect wallet. Please try again.";
        setStatus("error", message);
      }
    }
  };

  const handleBack = () => {
    clearError();
    setSelectedWallet(null);
    setStatus("idle");
  };

  const isProcessing =
    status === "signing" || status === "requesting_nonce" || status === "verifying" || status === "authenticated";

  const isMetaMaskDetected = typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      data-testid="connect-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isProcessing) onClose();
      }}
    >
      <div
        className="modal animate-fade-in"
        role="dialog"
        aria-labelledby="login-t"
        data-testid="connect-modal"
      >
        {/* Modal Header */}
        <div className="mh">
          <WolfLogo size={38} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="login-t" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              {isProcessing && selectedWallet ? "Connecting to wallet..." : "Sign in to Bloody-Roar"}
            </h2>
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "2px 0 0 0" }}>
              {isProcessing
                ? "Please confirm the action in your wallet"
                : "Your wallet is your account. New wallets get an account on first sign-in."}
            </p>
          </div>
          <button
            type="button"
            className="ibtn"
            aria-label="Close"
            onClick={onClose}
            disabled={status === "authenticated"}
            style={{ width: 32, height: 32, marginLeft: 8 }}
          >
            <X className="ico" style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mb">
          {/* Active Connection or Error State */}
          {isProcessing || error ? (
            <div className="states" style={{ width: "100%" }}>
              {status === "signing" && (
                <div className="st">
                  <div className="st-h">
                    <span className="dot" style={{ background: "var(--warn)" }} />
                    Waiting for signature
                  </div>
                  <div className="siwe">
                    bloody-roar.app wants you to sign in with your Ethereum account:
                    {"\n\n"}Sign in to Bloody-Roar.
                    {"\n\n"}URI: https://bloody-roar.app
                    {"\n"}Version: 1
                    {"\n"}Chain ID: 84532
                  </div>
                  <p style={{ color: "var(--ink-2)", fontSize: "12.5px" }}>
                    Sign the one-time SIWE message in {selectedWallet?.name || "your wallet"}. No gas fee is charged.
                  </p>
                  <button type="button" onClick={handleBack} className="btn btn-g btn-sm" style={{ alignSelf: "flex-start" }}>
                    Cancel
                  </button>
                </div>
              )}

              {(status === "requesting_nonce" || status === "verifying") && (
                <div className="st">
                  <div className="st-h">
                    <span className="spin" aria-hidden="true" />
                    {status === "requesting_nonce" ? "Requesting authentication challenge..." : "Verifying signature..."}
                  </div>
                  <p style={{ color: "var(--ink-2)" }}>Securing your session with the Bloody-Roar backend.</p>
                </div>
              )}

              {status === "authenticated" && (
                <div className="st">
                  <div className="st-h" style={{ color: "var(--ok)" }}>
                    <span className="dot" style={{ background: "var(--ok)" }} />
                    Connected successfully!
                  </div>
                  <p style={{ color: "var(--ink-2)" }}>Entering Bloody-Roar workspace...</p>
                </div>
              )}

              {error && (
                <div className="st">
                  <div className="st-h" style={{ color: "var(--bad)" }}>
                    <AlertCircle className="ico" />
                    Connection failed
                  </div>
                  <p className="err">{error}</p>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="btn btn-o btn-sm"
                    style={{ alignSelf: "flex-start" }}
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Tab Switcher */}
              <div className="mtabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  data-testid="tab-web3-btn"
                  aria-selected={activeTab === "web3"}
                  className={activeTab === "web3" ? "on" : ""}
                  onClick={() => setActiveTab("web3")}
                >
                  Wallet
                </button>
                <button
                  type="button"
                  role="tab"
                  data-testid="tab-social-btn"
                  aria-selected={activeTab === "social"}
                  className={activeTab === "social" ? "on" : ""}
                  onClick={() => setActiveTab("social")}
                >
                  Google · coming soon
                </button>
              </div>

              {activeTab === "web3" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {WALLET_OPTIONS.map((wallet) => (
                    <button
                      type="button"
                      key={wallet.id}
                      data-testid={`wallet-btn-${wallet.id}`}
                      onClick={() => handleWalletSelect(wallet)}
                      className="wopt"
                    >
                      <span
                        className="wlogo"
                        style={{
                          background:
                            wallet.id === "metamask"
                              ? "#E2761B"
                              : wallet.id === "coinbase"
                              ? "#0052FF"
                              : "#3A3F4B",
                        }}
                      >
                        {wallet.id === "metamask" ? "M" : wallet.id === "coinbase" ? "C" : "B"}
                      </span>
                      <span>{wallet.name}</span>
                      {wallet.id === "metamask" && isMetaMaskDetected && (
                        <span className="badge b-open" style={{ marginLeft: "auto" }}>
                          Detected
                        </span>
                      )}
                    </button>
                  ))}

                  {/* What happens next */}
                  <div className="how">
                    <b style={{ color: "var(--ink)" }}>What happens next</b>
                    <ol>
                      <li>Your wallet connects to this site.</li>
                      <li>We ask it to switch to Base Sepolia (chain 84532).</li>
                      <li>You sign a one-time message. No transaction, no gas.</li>
                    </ol>
                  </div>

                  <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                    We never ask for your seed phrase. By signing in you accept the{" "}
                    <a href="/#rules" style={{ color: "var(--link)" }}>
                      escrow rules
                    </a>
                    .
                  </p>
                </div>
              )}

              {activeTab === "social" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="how" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    <b style={{ color: "var(--ink)" }}>Wallet-first identity</b>
                    <p style={{ margin: 0 }}>
                      Social logins (Google, GitHub) cannot directly control smart contract escrow on Base Sepolia.
                      Please connect your wallet first, then you can link GitHub from your profile settings.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    onClick={() => setActiveTab("web3")}
                    style={{ alignSelf: "flex-start" }}
                  >
                    Switch to wallet sign-in
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

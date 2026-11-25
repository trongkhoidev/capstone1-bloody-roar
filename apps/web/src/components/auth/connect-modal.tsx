// apps/web/src/components/auth/connect-modal.tsx
"use client";

import { toast } from "@/lib/toast";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, AlertCircle } from "lucide-react";
import { WolfLogo } from "@/components/ui/wolf-logo";
import { WalletLogo } from "./wallet-icons";
import { useAuthStore } from "../../lib/store/use-auth-store";
import {
  WALLET_OPTIONS,
  ACTIVE_CHAIN,
  hasInjectedProvider,
  connectInjectedWallet,
  ensureActiveChain,
  setWalletKind,
  signMessageWithInjected,
} from "../../lib/web3/client";
import type { WalletOption } from "../../lib/web3/client";
import type * as InAppWallet from "@/lib/web3/in-app";

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOOGLE_SIGN_IN_FAILED = "Google sign-in failed. Please try again.";

export function ConnectModal({ isOpen, onClose }: ConnectModalProps) {
  const [activeTab, setActiveTab] = useState<"web3" | "social">("web3");
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);
  const [googleWallet, setGoogleWallet] = useState<typeof InAppWallet | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  const { status, error, loginWithSignature, clearError, setStatus } = useAuthStore();

  useEffect(() => {
    if (!isOpen || activeTab !== "social" || googleWallet || error) return;
    let active = true;
    void import("@/lib/web3/in-app").then((module) => {
      if (active) setGoogleWallet(module);
    }).catch(() => {
      if (active) setStatus("error", GOOGLE_SIGN_IN_FAILED);
    });
    return () => { active = false; };
  }, [activeTab, error, googleWallet, isOpen, setStatus]);

  if (!isOpen) return null;

  const finishLogin = (kind: "in-app" | "injected") => {
    setWalletKind(kind);
    onClose();
    router.replace(`${pathname}${window.location.search}`);
    router.refresh();
  };

  const handleWalletSelect = async (option: WalletOption) => {
    clearError();
    setSelectedWallet(option);

    if (option.type === "injected" || option.type === "coinbase") {
      try {
        if (!hasInjectedProvider(option.id)) {
          toast.error(
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
        await ensureActiveChain(option.id);
        const success = await loginWithSignature(address, (msg) =>
          signMessageWithInjected(address, msg, option.id)
        );

        if (success) finishLogin("injected");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to connect wallet. Please try again.";
        setStatus("error", message);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (!googleWallet?.isInAppConfigured()) return;
    setStatus("connecting");
    try {
      const account = await googleWallet.connectGoogle();
      const success = await loginWithSignature(account.address, (message) => account.signMessage({ message }));
      if (success) finishLogin("in-app");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = /opening pop-up|(?:pop-?up|window).*blocked|blocked.*(?:pop-?up|window)/i.test(detail)
        ? "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again."
        : /closed login window|(?:pop-?up|window).*closed|cancel(?:l?ed|lation)|access_denied/i.test(detail)
          ? "Google sign-in was cancelled."
          : GOOGLE_SIGN_IN_FAILED;
      setStatus("error", message);
    }
  };

  const handleBack = () => {
    clearError();
    setSelectedWallet(null);
    setStatus("idle");
  };

  const isProcessing =
    status === "connecting" || status === "signing" || status === "requesting_nonce" || status === "verifying" || status === "authenticated";
  const isGoogleSignIn = isProcessing && activeTab === "social";
  const isGoogleConfigured = googleWallet?.isInAppConfigured();

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
              {isGoogleSignIn ? "Signing in with Google…" : isProcessing && selectedWallet ? "Connecting to wallet..." : "Sign in to Bloody-Roar"}
            </h2>
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "2px 0 0 0" }}>
              {isGoogleSignIn
                ? "Complete Google sign-in to continue."
                : isProcessing
                ? "Please confirm the action in your wallet"
                : "Your wallet is your account. New wallets get an account on first sign-in."}
            </p>
          </div>
          <button
            type="button"
            className="ibtn"
            aria-label="Close"
            onClick={onClose}
            disabled={isGoogleSignIn || status === "authenticated"}
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
              {status === "signing" && !isGoogleSignIn && (
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
                    {"\n"}Chain ID: {ACTIVE_CHAIN.chainId}
                  </div>
                  <p style={{ color: "var(--ink-2)", fontSize: "12.5px" }}>
                    Sign the one-time SIWE message in {selectedWallet?.name || "your wallet"}. No gas fee is charged.
                  </p>
                  <button type="button" onClick={handleBack} className="btn btn-g btn-sm" style={{ alignSelf: "flex-start" }}>
                    Cancel
                  </button>
                </div>
              )}

              {(status === "connecting" || status === "requesting_nonce" || status === "verifying" || (status === "signing" && isGoogleSignIn)) && (
                <div className="st">
                  <div className="st-h">
                    <span className="spin" aria-hidden="true" />
                    {status === "connecting" ? "Waiting for Google…" : status === "requesting_nonce" ? "Requesting authentication challenge..." : status === "signing" ? "Signing the authentication challenge…" : "Verifying signature..."}
                  </div>
                  {status !== "connecting" && <p style={{ color: "var(--ink-2)" }}>Securing your session with the Bloody-Roar backend.</p>}
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
                  Google
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
                              ? "transparent"
                              : wallet.id === "coinbase"
                              ? "#0052FF"
                              : "#EEF2FE",
                          overflow: "hidden",
                          padding: 0,
                        }}
                      >
                        <WalletLogo walletId={wallet.id} size={30} />
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
                      <li>We ask it to switch to {ACTIVE_CHAIN.name} (chain {ACTIVE_CHAIN.chainId}).</li>
                      <li>You sign a one-time message. No transaction, no gas.</li>
                    </ol>
                  </div>

                  <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                    We never ask for your seed phrase. By signing in you accept the{" "}
                    <a href="/guide" style={{ color: "var(--link)" }}>
                      escrow rules
                    </a>
                    .
                  </p>
                </div>
              )}

              {activeTab === "social" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <button
                    type="button"
                    className="wopt"
                    data-testid="social-btn-google"
                    onClick={handleGoogleSignIn}
                    disabled={!isGoogleConfigured}
                  >
                    Continue with Google
                  </button>
                  <p className="how">
                    We create a wallet for your Google account. You&apos;ll need test ETH on {ACTIVE_CHAIN.name} for gas before funding or submitting work.
                  </p>
                  {isGoogleConfigured === false && <p>Google sign-in is not configured on this server.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

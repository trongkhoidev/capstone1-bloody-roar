"use client";

import {
  useAddress,
  useDisconnect,
  useConnectionStatus,
  ConnectWallet,
  useUser,
  useNetworkMismatch,
  useSwitchChain,
  useChain,
} from "@thirdweb-dev/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { LogOut, User, ListTodo, AlertTriangle, Loader2, Copy, Check } from "lucide-react";
import { useState } from "react";

const TARGET_CHAIN_ID = 11155111; // Sepolia

export function ConnectWalletBtn() {
  const address = useAddress();
  const disconnect = useDisconnect();
  const connectionStatus = useConnectionStatus();
  const { user } = useUser();
  const isMismatched = useNetworkMismatch();
  const switchChain = useSwitchChain();
  const chain = useChain();

  const [hasCopied, setHasCopied] = useState(false);

  // 1. Trạng thái Đang kết nối (Connecting / Loading)
  if (connectionStatus === "unknown" || connectionStatus === "connecting") {
    return (
      <Button
        variant="default"
        className="w-[140px] gap-2 cursor-wait bg-[hsl(var(--primary)/0.8)] text-[hsl(var(--primary-foreground))]"
        disabled
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm font-medium">Connecting...</span>
      </Button>
    );
  }

  // 2. Trạng thái Chưa kết nối hoặc Chưa đăng nhập SIWE (Sign-In with Ethereum)
  if (!address || !user) {
    return (
      <ConnectWallet
        theme="dark"
        btnTitle="Connect Wallet"
        modalTitle="Connect to Bloody-Roar"
        modalSize="compact"
        welcomeScreen={{
          title: "Bloody-Roar Marketplace",
          subtitle: "Connect your Web3 wallet to start hunting and posting bounties",
        }}
        switchToActiveChain={true}
        className="!bg-[hsl(var(--primary))] !text-[hsl(var(--primary-foreground))] !rounded-lg hover:!bg-[hsl(var(--primary-hover))] !h-10 !px-4 !py-2 !text-sm !font-medium !transition-all !shadow-[var(--shadow-glow)] !border-none"
      />
    );
  }

  // 3. Trạng thái Sai Mạng (Wrong Network Mismatch)
  if (isMismatched) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => switchChain(TARGET_CHAIN_ID)}
        className="h-10 gap-2 bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.9)] text-white shadow-md transition-all animate-pulse"
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="text-xs font-semibold">Switch to Sepolia</span>
      </Button>
    );
  }

  // 4. Trạng thái Đã kết nối & Đúng mạng Sepolia
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Network Badge */}
      <Badge
        variant="outline"
        className="hidden sm:inline-flex items-center gap-1.5 border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs text-[hsl(var(--foreground-muted))]"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        {chain?.name || "Sepolia"}
      </Badge>

      {/* User Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 pl-2 pr-3 h-10 border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.5)] transition-colors"
          >
            <Avatar className="h-6 w-6 ring-1 ring-[hsl(var(--primary)/0.3)]">
              <AvatarImage
                src={`https://api.dicebear.com/7.x/identicon/svg?seed=${address}`}
                alt="Wallet Avatar"
              />
              <AvatarFallback className="text-[10px]">0x</AvatarFallback>
            </Avatar>
            <span className="font-mono text-sm font-medium text-[hsl(var(--foreground))]">
              {shortAddress}
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-60 border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl"
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Connected Wallet
              </p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">
                  {shortAddress}
                </span>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="p-1 rounded hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  title="Copy address"
                >
                  {hasCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />

          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center cursor-pointer">
              <User className="mr-2 h-4 w-4 text-[hsl(var(--primary))]" />
              <span>My Profile</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href="/profile?tab=tasks" className="flex items-center cursor-pointer">
              <ListTodo className="mr-2 h-4 w-4 text-[hsl(var(--primary))]" />
              <span>My Tasks / Bounties</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-[hsl(var(--border))]" />

          <DropdownMenuItem
            onClick={() => disconnect()}
            className="flex items-center text-[hsl(var(--destructive))] focus:bg-[hsl(var(--destructive)/0.1)] focus:text-[hsl(var(--destructive))] cursor-pointer font-medium"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Disconnect Wallet</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

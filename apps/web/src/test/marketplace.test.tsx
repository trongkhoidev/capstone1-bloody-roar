// apps/web/src/test/marketplace.test.tsx
// Vitest Component Tests for Marketplace & ConnectModal
// Trâm (Test Engineer) — Sprint 1 (S2-TST-03 / S1-MKP-18)

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IssueCard } from "../components/marketplace/issue-card";
import type { IssueItem } from "../components/marketplace/issue-card";
import { MarketplaceFilterBar } from "../components/marketplace/filter-bar";
import { MarketplaceEmpty } from "../components/marketplace/marketplace-empty";
import { ConnectModal } from "../components/auth/connect-modal";
import { Button } from "../components/ui/button";
import { AuthStoreContext, createAuthStore } from "@/lib/store/use-auth-store";
import { getWalletKind, setWalletKind } from "@/lib/web3/client";
import { connectGoogle, isInAppConfigured } from "@/lib/web3/in-app";

vi.mock("@/lib/web3/in-app", () => ({
  connectGoogle: vi.fn(),
  isInAppConfigured: vi.fn(),
}));

const mockIssue: IssueItem = {
  id: "test-issue-1",
  title: "Audit Reentrancy Vulnerability in Escrow",
  description: "Detailed security review needed for the deposit and release logic.",
  category: "SECURITY",
  status: "OPEN",
  bountyAmount: 500,
  token: { symbol: "USDT" },
  requiredSkills: ["solidity", "security"],
  difficulty: "EXPERT",
  timeEstimate: "2 ngày",
  viewCount: 142,
  applicationCount: 3,
  createdAt: new Date().toISOString(),
  client: {
    id: "cl-1",
    name: "Satoshi",
    walletAddress: "0x8a90CAB1c62ada3699546a3daEEf0C55F7A2600E",
    reputationScore: 150,
    isGithubVerified: true,
  },
};

describe("IssueCard (StackOverflow Vibe)", () => {
  it("should render bounty amount, applicants, and view count in left metrics box", () => {
    render(<IssueCard issue={mockIssue} />);

    // Left metric box values
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("USDT")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("applications")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("should render issue title, description, and required skill tags", () => {
    const handleSkillClick = vi.fn();
    render(<IssueCard issue={mockIssue} onSkillClick={handleSkillClick} />);

    expect(
      screen.getByText("Audit Reentrancy Vulnerability in Escrow")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Detailed security review needed/i)
    ).toBeInTheDocument();

    const solidityTag = screen.getByText("solidity");
    expect(solidityTag).toBeInTheDocument();

    fireEvent.click(solidityTag);
    expect(handleSkillClick).toHaveBeenCalledWith("solidity");
  });

  it("should render client name, reputation, and verified check", () => {
    render(<IssueCard issue={mockIssue} />);

    expect(screen.getByText("Satoshi")).toBeInTheDocument();
    expect(screen.getByText("150 rep")).toBeInTheDocument();
    expect(screen.getByTitle("Verified GitHub account")).toBeInTheDocument();
  });
});

describe("MarketplaceFilterBar", () => {
  it("should display total count and trigger search changes", () => {
    const handleFilterChange = vi.fn();
    render(
      <MarketplaceFilterBar
        filters={{
          search: "",
          category: "",
          sortBy: "NEWEST",
        }}
        totalCount={42}
        onFilterChange={handleFilterChange}
      />
    );

    expect(screen.getByText("42")).toBeInTheDocument();

    const searchInput = screen.getByTestId("marketplace-search-input");
    fireEvent.change(searchInput, { target: { value: "reentrancy" } });

    expect(handleFilterChange).toHaveBeenCalledWith({ search: "reentrancy" });
  });

  it("should trigger sort change when clicking sort tabs", () => {
    const handleFilterChange = vi.fn();
    render(
      <MarketplaceFilterBar
        filters={{
          search: "",
          category: "",
          sortBy: "NEWEST",
        }}
        totalCount={10}
        onFilterChange={handleFilterChange}
      />
    );

    const highestBountyBtn = screen.getByTestId("sort-tab-highest_bounty");
    fireEvent.click(highestBountyBtn);

    expect(handleFilterChange).toHaveBeenCalledWith({
      sortBy: "HIGHEST_BOUNTY",
    });
  });
});

describe("MarketplaceEmpty", () => {
  it("should render empty state message and handle reset click", () => {
    const handleReset = vi.fn();
    render(<MarketplaceEmpty onResetFilters={handleReset} />);

    expect(
      screen.getByText("No matching bounties found")
    ).toBeInTheDocument();

    const resetBtn = screen.getByTestId("reset-filters-btn");
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalled();
  });
});

describe("ConnectModal", () => {
  it("renders the Google tab and disables sign-in without a client ID", async () => {
    vi.mocked(isInAppConfigured).mockReturnValue(false);
    render(<ConnectModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Sign in to Bloody-Roar")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-btn-metamask")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-btn-coinbase")).toBeInTheDocument();

    const socialTab = screen.getByRole("tab", { name: "Google" });
    fireEvent.click(socialTab);

    expect(socialTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Google sign-in is not configured on this server.")).toBeInTheDocument();
    expect(screen.getByTestId("social-btn-google")).toBeDisabled();
    expect(screen.queryByTestId("email-input")).not.toBeInTheDocument();
  });

  async function openGoogleTab(onClose: () => void, store = createAuthStore()) {
    vi.mocked(isInAppConfigured).mockReturnValue(true);
    render(
      <AuthStoreContext.Provider value={store}>
        <ConnectModal isOpen={true} onClose={onClose} />
      </AuthStoreContext.Provider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Google" }));
    const button = screen.getByTestId("social-btn-google");
    await waitFor(() => expect(button).toBeEnabled());
    return button;
  }

  it("signs the SIWE challenge with the Google account and closes the modal", async () => {
    setWalletKind(null);
    const address = `0x${"a".repeat(40)}` as const;
    const signMessage = vi.fn().mockResolvedValue("0xsigned");
    vi.mocked(connectGoogle).mockResolvedValueOnce({
      address,
      signMessage,
      sendTransaction: vi.fn(),
      signTypedData: vi.fn(),
    });
    const store = createAuthStore();
    const loginWithSignature = vi.fn<ReturnType<typeof store.getState>["loginWithSignature"]>()
      .mockImplementation(async (_address, sign) => {
        expect(getWalletKind()).toBeNull();
        expect(await sign("SIWE challenge")).toBe("0xsigned");
        return true;
      });
    store.setState({ loginWithSignature });
    const onClose = vi.fn();

    const button = await openGoogleTab(onClose, store);
    fireEvent.click(button);
    expect(connectGoogle).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Signing in with Google…" })).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(loginWithSignature).toHaveBeenCalledWith(address, expect.any(Function));
    expect(signMessage).toHaveBeenCalledWith({ message: "SIWE challenge" });
    expect(getWalletKind()).toBe("in-app");
    setWalletKind(null);
  });

  it.each([
    ["User closed login window", "Google sign-in was cancelled."],
    ["Something went wrong opening pop-up", "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again."],
  ])("lets the user retry after %s", async (detail, message) => {
    vi.mocked(connectGoogle).mockRejectedValueOnce(new Error(detail));
    const onClose = vi.fn();
    const button = await openGoogleTab(onClose);
    fireEvent.click(button);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByTestId("social-btn-google")).toBeEnabled();
  });
});

describe("Button", () => {
  it("keeps the child link as the single slotted element", () => {
    render(<Button asChild><a href="/marketplace">Open marketplace</a></Button>);
    expect(screen.getByRole("link", { name: "Open marketplace" })).toHaveAttribute("href", "/marketplace");
  });
});

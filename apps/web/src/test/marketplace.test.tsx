// apps/web/src/test/marketplace.test.tsx
// Vitest Component Tests for Marketplace & ConnectModal
// Trâm (Test Engineer) — Sprint 1 (S2-TST-03 / S1-MKP-18)

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IssueCard, IssueItem } from "../components/marketplace/issue-card";
import { MarketplaceFilterBar } from "../components/marketplace/filter-bar";
import { MarketplaceEmpty } from "../components/marketplace/marketplace-empty";
import { ConnectModal } from "../components/auth/connect-modal";

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
    expect(screen.getByText("đơn ứng tuyển")).toBeInTheDocument();
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
    expect(screen.getByText("⭐ 150")).toBeInTheDocument();
    expect(screen.getByTitle("Đã xác thực GitHub")).toBeInTheDocument();
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
      screen.getByText("Không tìm thấy bài toán nào phù hợp")
    ).toBeInTheDocument();

    const resetBtn = screen.getByTestId("reset-filters-btn");
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalled();
  });
});

describe("ConnectModal", () => {
  it("should render wallet options and switch between tabs", () => {
    render(<ConnectModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Đăng nhập Bloody-Roar")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-btn-metamask")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-btn-coinbase")).toBeInTheDocument();

    // Switch to Social tab
    const socialTab = screen.getByTestId("tab-social-btn");
    fireEvent.click(socialTab);

    expect(screen.getByTestId("social-btn-google")).toBeInTheDocument();
    expect(screen.getByTestId("social-btn-github")).toBeInTheDocument();
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
  });
});

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MarketplacePage from "../app/marketplace/page";
import { MarketplaceView } from "../components/marketplace/marketplace-view";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", () => ({ graphqlRequest: request }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("../components/layout/left-sidebar", () => ({ LeftSidebar: () => null }));

describe("marketplace URL filters", () => {
  it("uses the skill filter and resets the view when the search query changes", async () => {
    request.mockImplementation(async (query: string) => query.includes("MarketplaceStats")
      ? { marketplaceStats: { openBounties: 0, bountyPool: [], activeHunters: 0 } }
      : { issues: { edges: [], totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } } });
    const first = await MarketplacePage({ searchParams: Promise.resolve({ skills: "solidity" }) });
    const { rerender } = render(first);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("issues("), expect.objectContaining({ skill: "solidity", search: undefined }), expect.any(AbortSignal)));
    const second = await MarketplacePage({ searchParams: Promise.resolve({ search: "audit" }) });
    expect(second.key).not.toBe(first.key);
    rerender(second);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("issues("), expect.objectContaining({ search: "audit", skill: undefined }), expect.any(AbortSignal)));
    expect(first.type).toBe(MarketplaceView);
  });
});

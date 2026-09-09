// apps/web/src/app/marketplace/page.tsx
// Marketplace Bounties Directory Page

import { Metadata } from "next";
import { MarketplaceView } from "../../components/marketplace/marketplace-view";

export const metadata: Metadata = {
  title: "Bounty Marketplace — Bloody-Roar",
  description:
    "Duyệt danh sách bài toán kỹ thuật cần giải quyết. Tiền thưởng ký quỹ thông minh trên blockchain Base Sepolia.",
};

export default function MarketplacePage() {
  return <MarketplaceView />;
}

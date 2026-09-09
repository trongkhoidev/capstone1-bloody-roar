// apps/web/src/app/page.tsx
// Bloody-Roar — Decentralized Bounty Marketplace Homepage

import { Metadata } from "next";
import { MarketplaceView } from "../components/marketplace/marketplace-view";

export const metadata: Metadata = {
  title: "Bloody-Roar — Decentralized Bounty Marketplace",
  description:
    "Hire developers trustlessly. Blockchain escrow + AI Guard + AI Dispute resolution. Replace trust with mathematics and AI.",
};

export default function HomePage() {
  return <MarketplaceView />;
}

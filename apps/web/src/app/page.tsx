import type { Metadata } from "next";
import { HomePageView } from "@/components/home/home-page-view";

export const metadata: Metadata = {
  title: "Bloody-Roar — Bounty Marketplace",
  description: "Discover engineering bounties, apply with zero stake, and work with clear milestones.",
};

export default function HomePage({ searchParams }: { searchParams: { search?: string } }) {
  return <HomePageView search={searchParams.search ?? ""} />;
}

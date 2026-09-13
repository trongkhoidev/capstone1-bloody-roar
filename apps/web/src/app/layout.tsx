// apps/web/src/app/layout.tsx
// Root layout — wraps all pages with providers

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: {
    default: "Bloody-Roar — Decentralized Bounty Marketplace",
    template: "%s | Bloody-Roar",
  },
  description:
    "Hire developers trustlessly. Blockchain escrow + AI Guard + AI Dispute resolution. Zero platform bias.",
  keywords: [
    "blockchain",
    "bounty",
    "marketplace",
    "freelance",
    "smart contract",
    "escrow",
    "web3",
    "developer",
  ],
  authors: [{ name: "Bloody-Roar Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000",
    siteName: "Bloody-Roar",
    title: "Bloody-Roar — Decentralized Bounty Marketplace",
    description:
      "Replace trust with mathematics and AI. Blockchain escrow for freelance developers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bloody-Roar — Decentralized Bounty Marketplace",
    description:
      "Replace trust with mathematics and AI. Blockchain escrow for freelance developers.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen flex flex-col bg-background font-sans antialiased">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

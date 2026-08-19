// apps/web/src/app/layout.tsx
// Root layout — wraps all pages with providers

import type { Metadata } from "next";
import { Inter, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

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
    url: process.env.NEXT_PUBLIC_APP_URL,
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
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

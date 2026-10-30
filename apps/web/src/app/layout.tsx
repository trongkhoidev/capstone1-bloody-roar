// apps/web/src/app/layout.tsx
// Root layout — wraps all pages with providers

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: {
    default: "Bloody-Roar · Engineering bounties",
    template: "%s | Bloody-Roar",
  },
  description:
    "Engineering bounties with rewards held in escrow. AI Guard and AI dispute review.",
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
    title: "Bloody-Roar · Engineering bounties",
    description:
      "Engineering bounties with rewards held in escrow. AI Guard and AI dispute review.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bloody-Roar · Engineering bounties",
    description:
      "Engineering bounties with rewards held in escrow. AI Guard and AI dispute review.",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("bloody-roar-theme")||(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light");var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.classList.toggle("light",t==="light");d.dataset.theme=t;d.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] font-sans antialiased">
        <Providers>
          <Navbar />
          <div className="flex-1 br">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

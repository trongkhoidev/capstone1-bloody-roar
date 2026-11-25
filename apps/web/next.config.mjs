import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @param {string} phase @returns {import('next').NextConfig} */
const nextConfig = (phase) => ({
  // Keep development assets separate from production builds.
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
  // Use standalone output for Docker deployment (Sprint 4)
  // output: "standalone",

  // Enable React strict mode for better DX
  reactStrictMode: true,

  // External packages that should not be bundled by Next.js
  // (they're used in the custom server, not in the browser)
  experimental: {
    serverComponentsExternalPackages: ["pino", "pino-pretty", "socket.io", "@thirdweb-dev/auth", "@thirdweb-dev/wallets", "@thirdweb-dev/sdk", "ethers"],
    optimizePackageImports: ["thirdweb/wallets/in-app"],
    // Container builds set NEXT_BUILD_CPUS to cap parallel workers and avoid OOM kills.
    ...(process.env.NEXT_BUILD_CPUS && { cpus: Number(process.env.NEXT_BUILD_CPUS) }),
  },

  // Lint runs locally and in CI; container builds skip it to save memory (type checks still run).
  eslint: { ignoreDuringBuilds: process.env.SKIP_BUILD_LINT === "1" },

  // Image optimization
  images: {
    remotePatterns: [
      // AWS S3 or Supabase storage
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      // Avatar services
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },

  // Environment variables exposed to the browser
  // (prefix with NEXT_PUBLIC_)
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000",
    NEXT_PUBLIC_THIRDWEB_CLIENT_ID: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
  },

  // Webpack configuration for Web3 compatibility
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
      "@x402/extensions": false,
    };
    return config;
  },
});

export default nextConfig;

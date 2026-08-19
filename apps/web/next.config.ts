import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone output for Docker deployment (Sprint 4)
  // output: "standalone",

  // Enable React strict mode for better DX
  reactStrictMode: true,

  // External packages that should not be bundled by Next.js
  // (they're used in the custom server, not in the browser)
  serverExternalPackages: ["pino", "pino-pretty", "socket.io"],

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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
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
    return config;
  },
};

export default nextConfig;

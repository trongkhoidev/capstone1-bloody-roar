"use client";

// apps/web/src/app/providers.tsx
// Global providers wrapper

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <ThirdwebProvider
      clientId={process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || ""}
      activeChain="sepolia"
      authConfig={{
        domain:
          typeof window !== "undefined"
            ? window.location.host
            : process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ??
              "localhost:3000",
        authUrl: "/api/auth",
      }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThirdwebProvider>
  );
}

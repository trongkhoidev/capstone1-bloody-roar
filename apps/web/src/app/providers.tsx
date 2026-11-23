"use client";

// apps/web/src/app/providers.tsx
// Global providers wrapper

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AuthStoreContext, createAuthStore, useAuthStore, type AuthUser } from "@/lib/store/use-auth-store";
import { Toaster } from "@/components/ui/toaster";
import { UiPreferencesProvider } from "@/lib/ui-preferences";

export function Providers({ children, initialUser }: { children: ReactNode; initialUser?: AuthUser | null | undefined }) {
  const [authStore] = useState(() => initialUser === undefined ? useAuthStore : createAuthStore(initialUser));
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

  useEffect(() => {
    // Remove JWTs persisted by older builds. Authentication now uses an
    // HttpOnly cookie managed by the server.
    window.localStorage.removeItem("bloody-roar-auth");
    if (initialUser === undefined) void authStore.getState().restoreSession();
  }, [authStore, initialUser]);

  useEffect(() => authStore.subscribe((state, previous) => {
    if (previous.user && !state.user) {
      queryClient.removeQueries({ queryKey: ["issue-detail"] });
      queryClient.removeQueries({ queryKey: ["notifications"] });
    }
  }), [authStore, queryClient]);

  return (
    <AuthStoreContext.Provider value={authStore}>
      <UiPreferencesProvider>
        <QueryClientProvider client={queryClient}>{children}<Toaster /></QueryClientProvider>
      </UiPreferencesProvider>
    </AuthStoreContext.Provider>
  );
}

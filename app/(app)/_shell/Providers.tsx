"use client";
/** What every signed-in screen shares: the data cache, tooltips, the workspace (CloudGate) and the frame. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { reportError } from "@/lib/erreurs";
import { CloudGate } from "@/app/components/cloud";
import { TooltipProvider } from "@/app/ui";
import { Shell } from "./Shell";

export function AppProviders({ children }: { children: ReactNode }) {
  // Errors outside React's screens (an event handler, a promise): reported too.
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        <CloudGate>
          <Shell>{children}</Shell>
        </CloudGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

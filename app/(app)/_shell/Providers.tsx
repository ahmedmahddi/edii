"use client";
/** What every signed-in screen shares: the data cache, tooltips, the workspace (CloudGate) and the frame. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { CloudGate } from "@/app/components/cloud";
import { TooltipProvider } from "@/app/ui";
import { Shell } from "./Shell";

export function AppProviders({ children }: { children: ReactNode }) {
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

import type { ReactNode } from "react";
import { AppProviders } from "./_shell/Providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}

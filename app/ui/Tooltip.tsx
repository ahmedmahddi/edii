"use client";
import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

/** A short explanation on hover or focus. */
export function Tooltip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          style={{
            zIndex: 70,
            padding: "5px 8px",
            borderRadius: 4,
            background: "var(--ui-text)",
            color: "var(--ui-panel)",
            fontSize: "var(--ui-text-xs)",
            maxWidth: 280,
            lineHeight: 1.4,
          }}
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
export const TooltipProvider = T.Provider;

"use client";
/**
 * A screen not rebuilt yet on the design system: its own styles (app/styles/legacy.css) apply only
 * inside. Removed screen by screen; when none is left, legacy.css goes too.
 */
import type { ReactNode } from "react";

export function Legacy({ children }: { children: ReactNode }) {
  return <div className="legacy">{children}</div>;
}

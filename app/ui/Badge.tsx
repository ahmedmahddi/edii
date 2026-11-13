import type { ReactNode } from "react";
import s from "./Badge.module.css";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

/** A short status or label. `dot` for a state (conforme, en retard…), `count` for a number. */
export function Badge({ tone = "neutral", dot, outline, count, children, title }: { tone?: Tone; dot?: boolean; outline?: boolean; count?: boolean; children: ReactNode; title?: string }) {
  return (
    <span data-ui="" title={title} className={[s.badge, tone !== "neutral" ? s[tone] : "", dot ? s.dot : "", outline ? s.outline : "", count ? s.count : ""].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

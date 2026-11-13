"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import s from "./Menu.module.css";

/** A menu opened from a button: keyboard navigation and focus handled (Radix). */
export function Menu({ trigger, children, align = "start", side = "bottom" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; side?: "top" | "bottom" }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content className={s.content} align={align} side={side} sideOffset={6} collisionPadding={8}>
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({ children, onSelect, icon, danger, checked }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean; checked?: boolean }) {
  return (
    <M.Item className={[s.item, danger ? s.danger : ""].join(" ")} onSelect={onSelect}>
      {icon}
      <span>{children}</span>
      {checked ? <Check size={14} className={s.check} /> : null}
    </M.Item>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className={s.label}>{children}</M.Label>;
export const MenuSeparator = () => <M.Separator className={s.separator} />;

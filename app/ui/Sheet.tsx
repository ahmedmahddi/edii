"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import s from "./Sheet.module.css";

/**
 * A panel over the page: from the right on desktop, from the bottom on a phone. Focus stays inside
 * while it is open, Escape closes it, and focus returns where it was (Radix Dialog).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  head,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  head?: ReactNode; // more under the title (badges…)
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={[s.content, wide ? s.wide : ""].join(" ")}>
          <div className={s.head}>
            <Dialog.Title className={s.title} dir="auto">
              {title}
            </Dialog.Title>
            {description ? <Dialog.Description className={s.description}>{description}</Dialog.Description> : <Dialog.Description className="visually-hidden">{typeof title === "string" ? title : ""}</Dialog.Description>}
            {head}
            <Dialog.Close asChild>
              <Button variant="ghost" icon className={s.close} aria-label="Fermer">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          <div className={s.body}>{children}</div>
          {footer ? <div className={s.footer}>{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled part of a sheet. */
export function SheetSection({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section data-ui="" style={{ display: "grid", gap: "var(--ui-space-3)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ fontSize: "var(--ui-text-sm)", fontWeight: 600, color: "var(--ui-text)" }}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

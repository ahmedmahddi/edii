"use client";
/** Something waiting in the register (texts modified at the JORT, new texts, texts that no longer apply). */
import { type ReactNode, useState } from "react";
import { Button, Panel } from "@/app/ui";
import s from "./Attention.module.css";

const FIRST = 3;

export function Attention({ title, note, action, children }: { title: string; note?: string; action?: ReactNode; children: ReactNode[] }) {
  const [all, setAll] = useState(false);
  return (
    <Panel title={title} actions={action} padded={false}>
      {note ? <p className={s.note}>{note}</p> : null}
      <ul className={s.list}>{all ? children : children.slice(0, FIRST)}</ul>
      {children.length > FIRST ? (
        <div className={s.more}>
          <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
            {all ? "Réduire" : `Voir les ${children.length - FIRST} autres`}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

export function AttentionItem({ children, meta, actions }: { children: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <li className={s.item}>
      <div className={s.text}>
        {children}
        {meta ? <span className={s.meta}>{meta}</span> : null}
      </div>
      {actions ? <div className={s.actions}>{actions}</div> : null}
    </li>
  );
}

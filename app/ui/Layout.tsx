import type { ReactNode } from "react";
import s from "./Layout.module.css";

export function Page({ children }: { children: ReactNode }) {
  return <div data-ui="" className={s.page}>{children}</div>;
}

/** The screen's title, one line on what it is for, and its actions. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header data-ui="" className={s.header}>
      <div className={s.headerText}>
        <h1 className={s.title}>{title}</h1>
        {description ? <p className={s.description}>{description}</p> : null}
      </div>
      {actions ? <div className={s.actions}>{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, actions, children, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean }) {
  return (
    <section data-ui="" className={s.panel}>
      {title ? (
        <div className={s.panelHead}>
          <h2 className={s.panelTitle}>{title}</h2>
          {actions}
        </div>
      ) : null}
      {padded ? <div className={s.panelBody}>{children}</div> : children}
    </section>
  );
}

export type StatTone = "success" | "warning" | "danger";
/** Key figures side by side; each may open the view it counts. */
export function Stats({ items }: { items: { label: string; value: ReactNode; tone?: StatTone; onClick?: () => void }[] }) {
  return (
    <div data-ui="" className={s.stats}>
      {items.map((i) =>
        i.onClick ? (
          <button key={i.label} type="button" className={[s.stat, i.tone ? s[i.tone] : ""].join(" ")} onClick={i.onClick}>
            <span className={s.statValue}>{i.value}</span>
            <span className={s.statLabel}>{i.label}</span>
          </button>
        ) : (
          <div key={i.label} className={[s.stat, i.tone ? s[i.tone] : ""].join(" ")}>
            <span className={s.statValue}>{i.value}</span>
            <span className={s.statLabel}>{i.label}</span>
          </div>
        ),
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, actions }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-ui="" className={s.empty}>
      {icon ? <div className={s.emptyIcon}>{icon}</div> : null}
      <h2 className={s.emptyTitle}>{title}</h2>
      {children ? <p className={s.emptyText}>{children}</p> : null}
      {actions ? <div className={s.emptyActions}>{actions}</div> : null}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div data-ui="" className={s.progress} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Notice({ tone = "info", icon, title, children, actions }: { tone?: "info" | "warning" | "danger"; icon?: ReactNode; title?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div data-ui="" className={[s.notice, s[tone]].join(" ")} role={tone === "info" ? "status" : "alert"}>
      {icon}
      <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
        {title ? <span className={s.noticeTitle}>{title}</span> : null}
        {children ? <span className={s.noticeText}>{children}</span> : null}
      </div>
      {actions}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd data-ui="" className={s.kbd}>{children}</kbd>;

/** A part of a settings page (Équipe, Mon compte, Administration). */
export function Section({ title, description, children, danger, id }: { title: ReactNode; description?: ReactNode; children: ReactNode; danger?: boolean; id?: string }) {
  return (
    <section data-ui="" id={id} className={[s.section, danger ? s.sectionDanger : ""].join(" ")} aria-labelledby={id ? `${id}-titre` : undefined}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle} id={id ? `${id}-titre` : undefined}>
          {title}
        </h2>
        {description ? <p className={s.sectionText}>{description}</p> : null}
      </div>
      <div className={s.sectionBody}>{children}</div>
    </section>
  );
}

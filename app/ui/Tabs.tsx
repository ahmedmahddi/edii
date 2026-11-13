import s from "./Tabs.module.css";

/** Views of the same list (Tous, À faire, Non conformes…), each with its count. */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div data-ui="" role="tablist" aria-label={label} className={s.tabs}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={s.tab} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined ? <span className={s.count}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

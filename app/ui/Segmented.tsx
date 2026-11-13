import s from "./Segmented.module.css";

/** One choice among a few, all visible. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  block,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: "success" | "danger" }[];
  label: string;
  block?: boolean;
}) {
  return (
    <div data-ui="" role="radiogroup" aria-label={label} className={[s.group, block ? s.block : ""].join(" ")}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={[s.item, o.tone ? s[o.tone] : ""].join(" ")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

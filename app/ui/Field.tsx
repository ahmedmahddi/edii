import { Search } from "lucide-react";
import { type ComponentProps, forwardRef, type ReactNode, useId } from "react";
import s from "./Field.module.css";

/** A labelled control, with a hint or an error under it. */
export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div data-ui="" className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint}>{hint}</span>
      ) : null}
    </div>
  );
}

/** An input with its label: the id ties them. */
export function TextField({ label, hint, error, ...rest }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <input id={rest.id ?? id} className={s.control} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

export function TextArea({ label, hint, error, ...rest }: ComponentProps<"textarea"> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <textarea id={rest.id ?? id} className={s.control} {...rest} />
    </Field>
  );
}

export function SelectField({ label, hint, children, ...rest }: ComponentProps<"select"> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={rest.id ?? id}>
      <select id={rest.id ?? id} className={s.control} {...rest}>
        {children}
      </select>
    </Field>
  );
}

/** A bare control (when the label is elsewhere, or visually hidden). */
export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...rest }, ref) {
  return <input data-ui="" ref={ref} className={[s.control, className ?? ""].join(" ")} {...rest} />;
});
export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select data-ui="" className={[s.control, className ?? ""].join(" ")} {...rest} />;
}

/** A search box: the icon inside, the label for screen readers. */
export const SearchInput = forwardRef<HTMLInputElement, ComponentProps<"input"> & { label: string }>(function SearchInput({ label, className, ...rest }, ref) {
  return (
    <div data-ui="" className={[s.search, className ?? ""].join(" ")}>
      <Search size={15} aria-hidden="true" />
      <input ref={ref} type="search" aria-label={label} className={s.control} {...rest} />
    </div>
  );
});

export function Checkbox({ children, ...rest }: ComponentProps<"input"> & { children: ReactNode }) {
  return (
    <label data-ui="" className={s.checkbox}>
      <input type="checkbox" {...rest} />
      <span>{children}</span>
    </label>
  );
}

/** An on/off setting, said in words beside it. */
export function Switch({ label, description, ...rest }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label data-ui="" className={s.switchRow}>
      <span className={s.switchText}>
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <input type="checkbox" role="switch" className={s.switch} {...rest} />
    </label>
  );
}

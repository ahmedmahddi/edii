import Link from "next/link";
import { type ComponentProps, forwardRef } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type Common = { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; icon?: boolean; block?: boolean };

const classes = ({ variant = "secondary", size = "md", icon, block }: Common, extra?: string) =>
  [s.button, s[variant], size !== "md" ? s[size] : "", icon ? s.icon : "", block ? s.block : "", extra ?? ""].filter(Boolean).join(" ");

/** The app's button. Secondary by default; one primary action per view. */
export const Button = forwardRef<HTMLButtonElement, ComponentProps<"button"> & Common>(function Button({ variant, size, icon, block, className, type = "button", ...rest }, ref) {
  return <button data-ui="" ref={ref} type={type} className={classes({ variant, size, icon, block }, className)} {...rest} />;
});

/** A link that looks like a button (navigation, not an action). */
export function ButtonLink({ variant, size, icon, block, className, ...rest }: ComponentProps<typeof Link> & Common) {
  return <Link data-ui="" className={classes({ variant, size, icon, block }, className)} {...rest} />;
}

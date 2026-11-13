"use client";
/** The app's appearance: the system's (Auto), light or dark, kept in this browser. */
import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const KEY = "abclassement-theme";

function apply(t: Theme) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function ThemeChoice({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      // the system's
    }
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    apply(t);
    try {
      if (t === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // for this visit only
    }
  };
  const options: [Theme, string][] = [
    ["auto", "Auto"],
    ["light", "Clair"],
    ["dark", "Sombre"],
  ];
  return (
    <div className={`segmented theme-choice${compact ? " is-compact" : ""}`} role="radiogroup" aria-label="Apparence">
      {options.map(([t, label]) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} className={`seg${theme === t ? " active" : ""}`} onClick={() => choose(t)}>
          {label}
        </button>
      ))}
    </div>
  );
}

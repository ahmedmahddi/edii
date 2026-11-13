"use client";
/** The appearance: the device's (auto), light or dark, kept in this browser (see app/layout.tsx). */
import { useCallback, useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";
const KEY = "abclassement-theme";

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, set] = useState<Theme>("auto");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") set(t);
    } catch {
      // the device's
    }
  }, []);
  const setTheme = useCallback((t: Theme) => {
    set(t);
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // this visit only
    }
  }, []);
  return { theme, setTheme };
}

"use client";

/** Light / dark / system theme. The choice is remembered in this browser; dark is the default. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "lostfinder.theme";

/** Runs before the page is painted (see layout.tsx), so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.add("dark");}})();`;

interface ThemeState {
  choice: ThemeChoice;
  dark: boolean;
  setChoice: (c: ThemeChoice) => void;
}
const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("dark");
  const [dark, setDark] = useState(true);

  useEffect(() => {
    try {
      setChoiceState((localStorage.getItem(KEY) as ThemeChoice) || "dark");
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const d = choice === "dark" || (choice === "system" && media.matches);
      document.documentElement.classList.toggle("dark", d);
      setDark(d);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* the choice still applies for this visit */
    }
  }, []);

  return <Ctx.Provider value={{ choice, dark, setChoice }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemePreference = "light" | "dark" | "olive" | "system";
type Theme = "light" | "dark" | "olive";

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

function readSystemTheme(): "light" | "dark" {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(fallback: ThemePreference): ThemePreference {
  try {
    const stored = window.localStorage.getItem("theme-preference") || window.localStorage.getItem("theme");
    return stored === "light" || stored === "dark" || stored === "olive" || stored === "system" ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children, defaultTheme = "system", switchable = false }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (!switchable || typeof window === "undefined") return defaultTheme;
    return readStoredPreference(defaultTheme);
  });
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => readSystemTheme());
  const theme: Theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme !== "light");
    root.dataset.theme = theme;
    if (switchable) {
      try {
        window.localStorage.setItem("theme-preference", preference);
        window.localStorage.setItem("theme", preference === "system" ? theme : preference);
      } catch {
        // Theme still applies for the current session when storage is unavailable.
      }
    }
  }, [preference, theme, switchable]);

  const setThemePreference = (next: ThemePreference) => setPreference(switchable ? next : "dark");
  const toggleTheme = switchable
    ? () => setPreference(previous => previous === "dark" ? "light" : previous === "light" ? "olive" : "dark")
    : undefined;
  const value = useMemo(() => ({ theme, preference, setThemePreference, toggleTheme, switchable }), [theme, preference, switchable]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

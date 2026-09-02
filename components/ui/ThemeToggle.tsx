"use client";

import { useEffect } from "react";
import { usePersistedChoice } from "@/lib/ui/usePersistedChoice";

/**
 * Light/dark switch.
 *
 * The palette lives entirely in CSS custom properties keyed off
 * `data-theme` on <html> (see app/globals.css), so this component's whole
 * job is to set that attribute and remember the choice. Nothing else
 * re-renders on a theme change — the variables cascade.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ohun-theme";

const THEMES = ["light", "dark"] as const;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = usePersistedChoice<Theme>(THEME_STORAGE_KEY, THEMES, "dark");

  // The stored value is the source of truth; this keeps the document in
  // step with it, including when the change came from another tab. The
  // pre-paint script in app/layout.tsx does the same thing for the very
  // first render, before React exists.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--foreground)] ${className}`}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

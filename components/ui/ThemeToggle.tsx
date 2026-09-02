"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark switch.
 *
 * The palette lives entirely in CSS custom properties keyed off
 * `data-theme` on <html> (see app/globals.css), so this component's whole
 * job is to set that attribute and remember the choice. Nothing re-renders
 * on a theme change — the variables cascade.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ohun-theme";

/**
 * Applied before first paint by the inline script in app/layout.tsx, and
 * again here whenever the user switches. Kept in one place so the two can
 * never drift into disagreeing about what "light" means.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    // Private browsing, or storage blocked entirely.
    return "dark";
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // Dark on the server and on the first client render, matching the CSS
  // default. The real value is read after mount, because localStorage does
  // not exist during SSR and guessing would flip the icon on hydration.
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still applies for this page; it just will not persist.
    }
  };

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--foreground)] ${className}`}
    >
      {/* Before mount the stored choice is unknown, so show neither icon
          rather than the wrong one for a frame. */}
      {!mounted ? (
        <span aria-hidden className="h-4 w-4" />
      ) : theme === "dark" ? (
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

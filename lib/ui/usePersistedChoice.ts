"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A small setting remembered on this device — the theme, how much of each
 * message to show.
 *
 * Built on useSyncExternalStore rather than "useState plus an effect that
 * reads localStorage". That pattern renders the default, then immediately
 * re-renders with the stored value, which is both a wasted render and a
 * flash of the wrong setting. This instead declares localStorage as what it
 * actually is — state living outside React — and lets React read the
 * server value during hydration and the real one straight afterwards,
 * without a mismatch.
 *
 * Changes made in another tab arrive through the same subscription, so two
 * open tabs stay in step.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // "storage" only fires in *other* tabs, which is why local writes notify
  // the set directly rather than relying on it.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing, or storage blocked entirely.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies for this page; it just will not persist.
  }
  listeners.forEach((listener) => listener());
}

export function usePersistedChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const getSnapshot = useCallback(() => {
    const stored = read(key);
    return allowed.includes(stored as T) ? (stored as T) : fallback;
    // `allowed` is a module-level constant at every call site; listing it
    // would force callers to memoise an array that never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);

  // The server has no localStorage, so it always renders the fallback —
  // which is exactly what the pre-paint script assumes too.
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback((next: T) => write(key, next), [key]);

  return [value, set];
}

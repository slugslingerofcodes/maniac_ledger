"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  applyTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

/**
 * Reads and writes the user's theme choice. Same external-store pattern as
 * `useTitleLanguage`/`useRecentSearches` — localStorage *is* the source of
 * truth, so subscribing to it beats mirroring it into component state.
 *
 * `getServerSnapshot` returns "system": on the server there is no stored
 * choice to read, and the blocking script in <head> has already put the right
 * class on <html> by the time anything paints, so the only thing that settles
 * after hydration is the toggle's own selected state.
 */

const CHANGE_EVENT = "theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system"
      ? raw
      : "system";
  } catch {
    return "system";
  }
}

const getServerSnapshot = (): Theme => "system";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Follow the OS while the choice is "system" — someone on a sunset schedule
  // shouldn't have to reload at dusk.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Storage disabled — the choice just won't survive a reload. */
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return {
    theme,
    /** What's actually on screen right now. */
    resolved: resolveTheme(theme),
    setTheme,
  } as const;
}

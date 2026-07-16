"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * App-wide ambient background preference. Persisted in localStorage; every
 * subscriber re-renders on change (same-tab via a custom event, cross-tab via
 * the storage event) — the same shape as `useTitleLanguage`.
 *
 * localStorage rather than a column on the user: this is a per-device display
 * choice with no server-side consumer, and it avoids a schema migration (which
 * in this project has to be pasted into the Supabase SQL editor by hand).
 */

export type BackgroundChoice = "default" | "gears" | "raphael";

const STORAGE_KEY = "app-background";
const CHANGE_EVENT = "app-background-change";

export const BACKGROUND_OPTIONS: {
  value: BackgroundChoice;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Default",
    description: "The temporal rune vortex.",
  },
  { value: "gears", label: "Gears", description: "Turning clockwork." },
  { value: "raphael", label: "Raphael", description: "The Great Sage." },
];

/** Video sources for the motion backgrounds (`default` paints its own CSS). */
export const BACKGROUND_VIDEO: Partial<Record<BackgroundChoice, string>> = {
  gears: "/backgrounds/gears.mp4",
  raphael: "/backgrounds/raphael.mp4",
};

function isChoice(value: string | null): value is BackgroundChoice {
  return value === "gears" || value === "raphael" || value === "default";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): BackgroundChoice {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isChoice(stored) ? stored : "default";
}

// SSR/hydration snapshot; the stored value applies right after hydration.
function getServerSnapshot(): BackgroundChoice {
  return "default";
}

export function useBackground(): [
  BackgroundChoice,
  (choice: BackgroundChoice) => void,
] {
  const choice = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setChoice = useCallback((next: BackgroundChoice) => {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [choice, setChoice];
}

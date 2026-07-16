"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Last few search queries, persisted per device in localStorage — same
 * external-store pattern as `useBackground`/`useTitleLanguage`. Recorded only
 * for searches that actually returned results, so the list never fills up
 * with typos.
 */

const STORAGE_KEY = "recent-anime-searches";
const CHANGE_EVENT = "recent-searches-change";
const MAX = 6;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

// Referentially stable snapshot: useSyncExternalStore compares by identity,
// so a fresh array every call would loop forever.
let cache: string[] = [];
let cacheRaw: string | null = null;

function getSnapshot(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}

const getServerSnapshot = (): string[] => [];

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useRecentSearches(): [
  string[],
  (query: string) => void,
  () => void,
] {
  const searches = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const record = useCallback((query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    const next = [q, ...read().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [searches, record, clear];
}

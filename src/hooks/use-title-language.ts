"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * App-wide title display preference: MAL's default (romaji/Japanese) title vs
 * the English title. Persisted in localStorage; every subscriber re-renders on
 * change (same-tab via a custom event, cross-tab via the storage event).
 */

export type TitleLanguage = "english" | "japanese";

const STORAGE_KEY = "title-language";
const CHANGE_EVENT = "title-language-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): TitleLanguage {
  return localStorage.getItem(STORAGE_KEY) === "japanese"
    ? "japanese"
    : "english";
}

// SSR/hydration snapshot; the client value applies right after hydration.
function getServerSnapshot(): TitleLanguage {
  return "english";
}

export function useTitleLanguage(): [
  TitleLanguage,
  (lang: TitleLanguage) => void,
] {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLang = useCallback((next: TitleLanguage) => {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [lang, setLang];
}

/** Pick the display title for the current preference. */
export function displayTitle(
  lang: TitleLanguage,
  title: string,
  titleEnglish: string | null | undefined,
): string {
  return lang === "japanese" ? title : (titleEnglish ?? title);
}

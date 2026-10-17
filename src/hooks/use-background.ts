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
 * The custom image is per-device for the same reason — uploading it to
 * Supabase storage would need a bucket + policies for a purely cosmetic file.
 */

export type BackgroundChoice =
  | "leather"
  | "default"
  | "gears"
  | "clockwork"
  | "eyeclock"
  | "custom";

/**
 * What you get having never chosen — now the plain blue leather.
 *
 * Note `"default"` is still a *value*, and deliberately keeps that name: it is
 * what everyone who explicitly picked the animated scenes already has in
 * localStorage, and renaming it would silently reset their choice. Only the
 * fallback moved. Its user-facing label became "Scenes", because an option
 * labelled "Default" that isn't the default is worse than a rename.
 */
const DEFAULT_CHOICE: BackgroundChoice = "leather";

const STORAGE_KEY = "app-background";
/** Data-URL of the user's own image, when `choice === "custom"`. */
const IMAGE_KEY = "app-background-image";
const CHANGE_EVENT = "app-background-change";

export const BACKGROUND_OPTIONS: {
  value: BackgroundChoice;
  label: string;
  description: string;
}[] = [
  // These two differ only in what sits behind general pages — the galaxy,
  // poster wall and cosmos keep their own either way — so the descriptions are
  // deliberately parallel and say exactly that.
  {
    value: "leather",
    label: "Blue leather",
    description: "Plain and quiet behind most pages.",
  },
  {
    value: "default",
    label: "Scenes",
    description: "An animated vortex behind most pages.",
  },
  { value: "gears", label: "Gears", description: "Turning brass clockwork." },
  { value: "clockwork", label: "Clockwork", description: "The full movement." },
  {
    value: "eyeclock",
    label: "Eye Clock",
    description: "A glowing iris telling the time.",
  },
  { value: "custom", label: "Custom", description: "Your own picture." },
];

/** Video sources for the motion backgrounds (the rest paint their own CSS). */
export const BACKGROUND_VIDEO: Partial<Record<BackgroundChoice, string>> = {
  gears: "/backgrounds/gears.mp4",
  clockwork: "/backgrounds/clockwork.mp4",
};

function isChoice(value: string | null): value is BackgroundChoice {
  return (
    value === "leather" ||
    value === "default" ||
    value === "gears" ||
    value === "clockwork" ||
    value === "eyeclock" ||
    value === "custom"
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getChoiceSnapshot(): BackgroundChoice {
  const stored = localStorage.getItem(STORAGE_KEY);
  const choice = isChoice(stored) ? stored : DEFAULT_CHOICE;
  // A "custom" choice whose image has been cleared (or never saved) has
  // nothing to render — fall back instead of showing a black void.
  if (choice === "custom" && !localStorage.getItem(IMAGE_KEY)) {
    return DEFAULT_CHOICE;
  }
  return choice;
}

function getImageSnapshot(): string | null {
  return localStorage.getItem(IMAGE_KEY);
}

// SSR/hydration snapshots; the stored values apply right after hydration.
const getServerChoice = (): BackgroundChoice => DEFAULT_CHOICE;
const getServerImage = (): string | null => null;

function emitChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useBackground(): [
  BackgroundChoice,
  (choice: BackgroundChoice) => void,
] {
  const choice = useSyncExternalStore(
    subscribe,
    getChoiceSnapshot,
    getServerChoice,
  );
  const setChoice = useCallback((next: BackgroundChoice) => {
    localStorage.setItem(STORAGE_KEY, next);
    emitChange();
  }, []);
  return [choice, setChoice];
}

/** The stored custom image (data URL), and a setter that also selects it. */
export function useCustomBackgroundImage(): [
  string | null,
  (dataUrl: string) => void,
] {
  const image = useSyncExternalStore(subscribe, getImageSnapshot, getServerImage);
  const setImage = useCallback((dataUrl: string) => {
    try {
      localStorage.setItem(IMAGE_KEY, dataUrl);
      localStorage.setItem(STORAGE_KEY, "custom");
    } catch {
      // Quota exceeded — the picker's downscale should prevent this, but a
      // failed save must not throw out of an input handler.
      return;
    }
    emitChange();
  }, []);
  return [image, setImage];
}

/**
 * File → downscaled JPEG data URL that fits comfortably in localStorage.
 * Backgrounds render full-bleed behind a dark veil, so 1920px and 0.82
 * quality are indistinguishable from the original in practice.
 */
export async function fileToBackgroundDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

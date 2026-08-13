/**
 * A one-event bus so anything can open the command palette without the palette
 * having to be lifted into context. `AppNav`'s search field and the mobile
 * search icon both dispatch this; `CommandPalette` listens.
 *
 * A DOM CustomEvent rather than a store: there is exactly one palette, mounted
 * once per layout, and the only message is "open".
 */
export const COMMAND_PALETTE_OPEN_EVENT = "anime-maniacs:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}

/* -------------------------------------------------------------------------- */
/* Recent destinations                                                        */
/* -------------------------------------------------------------------------- */

const RECENTS_KEY = "anime-maniacs-palette-recents";
const RECENTS_CHANGE_EVENT = "palette-recents-change";
const MAX_RECENTS = 5;

export type PaletteRecent = {
  label: string;
  href: string;
};

function read(): PaletteRecent[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is PaletteRecent =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as PaletteRecent).href === "string" &&
          typeof (r as PaletteRecent).label === "string",
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

// Referentially stable snapshot: useSyncExternalStore compares by identity,
// so a fresh array every call would loop forever. (Same shape as
// `useRecentSearches`.)
let cache: PaletteRecent[] = [];
let cacheRaw: string | null = null;

/**
 * The palette used to answer an empty query with all twenty pages in
 * declaration order — a wall of equally-weighted links. Showing what you
 * actually use first turns the first keystroke into a confirmation instead of
 * a search.
 */
export function getPaletteRecentsSnapshot(): PaletteRecent[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENTS_KEY);
  } catch {
    return cache;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = read();
  }
  return cache;
}

export const getPaletteRecentsServerSnapshot = (): PaletteRecent[] => [];

export function subscribeToPaletteRecents(onChange: () => void) {
  window.addEventListener(RECENTS_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RECENTS_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function pushPaletteRecent(entry: PaletteRecent) {
  if (typeof window === "undefined") return;
  try {
    const next = [
      entry,
      ...read().filter((r) => r.href !== entry.href),
    ].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* Storage disabled — recents just won't persist. */
    return;
  }
  window.dispatchEvent(new Event(RECENTS_CHANGE_EVENT));
}

/**
 * Theme plumbing. `globals.css` has always defined a complete light palette
 * under `:root` alongside the dark one under `.dark`, but the root layout
 * hardcoded `class="dark"` on `<html>` — so half the design tokens in the
 * stylesheet could never render. This makes the choice real.
 *
 * Hand-rolled rather than pulling in `next-themes`: the whole contract is one
 * class on `<html>`, one localStorage key, and one media query, and the project
 * already hand-writes this kind of thing (the service worker, the command
 * palette). The blocking script below is the part a library would mainly buy
 * you, and it's eleven lines.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "anime-maniacs-theme";

/** The class the stylesheet keys dark tokens off (`@custom-variant dark`). */
const DARK_CLASS = "dark";

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle(DARK_CLASS, resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

/**
 * Runs before first paint, inlined in <head>. Without it the page renders in
 * whatever the server guessed, then snaps — a full-screen flash on every load.
 * Kept as a string (not a component) so it can go in a `dangerouslySetInnerHTML`
 * script tag ahead of any stylesheet-dependent markup.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "light" || stored === "dark" ? stored : null;
    var dark = theme
      ? theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle(${JSON.stringify(DARK_CLASS)}, dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {
    /* Private mode / storage disabled — fall back to the dark default. */
    document.documentElement.classList.add(${JSON.stringify(DARK_CLASS)});
  }
})();
`.trim();

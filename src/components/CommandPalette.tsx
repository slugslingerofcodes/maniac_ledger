"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, CornerDownLeft, Search } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import type { JikanAnime } from "@/lib/jikan";

/**
 * Ctrl/⌘+K command palette: jump to any page or straight to an anime, from
 * anywhere. Sixteen nav items live behind a two-tap drawer; people who are
 * typing anyway get there in two keystrokes — and pages like /songs become
 * discoverable at all.
 *
 * One flat result list: matching pages first (instant, local), then anime
 * matches from /api/anime/search (debounced, ≥2 chars, public path). Arrow
 * keys move, Enter goes, Escape leaves. Hand-rolled rather than base-ui's
 * Dialog because the whole surface is one input + one listbox — the ARIA
 * combobox wiring below is smaller than restyling a dialog to behave.
 */

type PageResult = { kind: "page"; label: string; href: string };
type AnimeResult = {
  kind: "anime";
  malId: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
};
type Result = PageResult | AnimeResult;

/** Everywhere the palette can take you directly (nav + a few unlisted). */
const PAGES: PageResult[] = [
  { kind: "page", label: "Home", href: "/" },
  ...NAV_ITEMS.map((i) => ({ kind: "page" as const, label: i.label, href: i.href })),
  { kind: "page", label: "Profile", href: "/profile" },
  { kind: "page", label: "Announcements", href: "/announcements" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [animeResults, setAnimeResults] = useState<AnimeResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Global shortcut. ⌘K on mac, Ctrl+K elsewhere; "/" is left alone (search
  // boxes own it).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setAnimeResults([]);
    setActiveIndex(0);
  }, []);

  // Anime search rides the same public API as the search page.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!open || q.length < 2) return;
    const controller = new AbortController();
    fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        const list = ((body.results ?? []) as JikanAnime[]).slice(0, 6).map(
          (a): AnimeResult => ({
            kind: "anime",
            malId: a.mal_id,
            title: a.title_english ?? a.title,
            posterUrl: a.images?.jpg?.image_url ?? null,
            year: a.year,
          }),
        );
        setAnimeResults(list);
      })
      .catch(() => {
        /* aborted or upstream down — the pages section still works */
      });
    return () => controller.abort();
  }, [debouncedQuery, open]);

  if (!open) {
    return null;
  }

  const q = query.trim().toLowerCase();
  const pageMatches = q
    ? PAGES.filter((p) => p.label.toLowerCase().includes(q))
    : PAGES;
  const showAnime = q.length >= 2;
  const results: Result[] = [
    ...pageMatches,
    ...(showAnime ? animeResults : []),
  ];
  const active = Math.min(activeIndex, Math.max(0, results.length - 1));

  function go(result: Result) {
    close();
    router.push(result.kind === "page" ? result.href : `/anime/mal/${result.malId}`);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close command palette"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
      />

      <div className="glass relative w-full max-w-lg overflow-hidden rounded-xl border border-border shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a page or search anime…"
            aria-label="Command palette search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            esc
          </kbd>
        </div>

        <ul
          id="palette-results"
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {showAnime ? "Nothing matches." : "Type to search…"}
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.kind === "page" ? r.href : `mal-${r.malId}`}>
                <button
                  id={`palette-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(r)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                    i === active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {r.kind === "page" ? (
                    <>
                      <Clapperboard className="size-4 shrink-0 opacity-60" aria-hidden />
                      <span className="flex-1">{r.label}</span>
                      <span className="text-xs opacity-50">{r.href}</span>
                    </>
                  ) : (
                    <>
                      <span className="relative aspect-[2/3] w-6 shrink-0 overflow-hidden rounded bg-muted">
                        {r.posterUrl ? (
                          <Image src={r.posterUrl} alt="" fill sizes="24px" className="object-cover" />
                        ) : null}
                      </span>
                      <span className="line-clamp-1 flex-1">{r.title}</span>
                      {r.year != null ? (
                        <span className="text-xs opacity-50">{r.year}</span>
                      ) : null}
                    </>
                  )}
                  {i === active ? (
                    <CornerDownLeft className="size-3.5 shrink-0 opacity-50" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

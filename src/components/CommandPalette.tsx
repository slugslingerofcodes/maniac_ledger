"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BookOpen, Clapperboard, Clock, CornerDownLeft, Search } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  usePaletteSearch,
  type PaletteAnime,
  type PaletteManga,
} from "@/hooks/use-palette-search";
import {
  COMMAND_PALETTE_OPEN_EVENT,
  getPaletteRecentsServerSnapshot,
  getPaletteRecentsSnapshot,
  pushPaletteRecent,
  subscribeToPaletteRecents,
} from "@/lib/command-palette";
import { posterUrl } from "@/lib/poster";

/**
 * Ctrl/⌘+K command palette: jump to any page or straight to an anime, from
 * anywhere. Sixteen nav items live behind a two-tap drawer; people who are
 * typing anyway get there in two keystrokes — and pages like /songs become
 * discoverable at all.
 *
 * One flat result list: matching pages first (instant, local), then anime
 * and manga matches from `usePaletteSearch` — library hits on the keystroke,
 * then cached / catalog / live results as each lands (debounced, ≥2 chars,
 * anime and manga fetched independently so a slow or dead upstream on one
 * side never holds back the other). Arrow
 * keys move, Enter goes, Escape leaves. Hand-rolled rather than base-ui's
 * Dialog because the whole surface is one input + one listbox — the ARIA
 * combobox wiring below is smaller than restyling a dialog to behave.
 */

type PageResult = {
  kind: "page";
  label: string;
  href: string;
  /** Off-site: opened in a new tab rather than pushed onto the router. */
  external?: boolean;
};
type AnimeResult = PaletteAnime;
type MangaResult = PaletteManga;
type Result = PageResult | AnimeResult | MangaResult;

/** Where a result opens. Keyed off the shape rather than stored per result. */
function resultHref(r: AnimeResult | MangaResult): string {
  if (r.kind === "anime") return `/anime/mal/${r.malId}`;
  return r.malId != null ? `/manga/${r.malId}` : `/manga/md/${r.mangadexId}`;
}

/**
 * Everywhere the palette can take you directly (nav + a few unlisted).
 *
 * Deduped by href because "Home" is both hardcoded here and present in
 * `NAV_ITEMS`: the list rendered it twice and React warned about the duplicate
 * `/` key on every empty-query open.
 */
const PAGES: PageResult[] = dedupeByHref([
  { kind: "page", label: "Home", href: "/" },
  ...NAV_ITEMS.map((i) => ({
    kind: "page" as const,
    label: i.label,
    href: i.href,
    external: i.external,
  })),
  { kind: "page", label: "Profile", href: "/profile" },
  { kind: "page", label: "Reminders", href: "/notifications" },
  { kind: "page", label: "Announcements", href: "/announcements" },
]);

function dedupeByHref(pages: PageResult[]): PageResult[] {
  const seen = new Set<string>();
  return pages.filter((p) => !seen.has(p.href) && seen.add(p.href));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const {
    anime: animeResults,
    manga: mangaResults,
    searching,
  } = usePaletteSearch(open, query);
  const [activeIndex, setActiveIndex] = useState(0);
  // localStorage is the source of truth for recents — subscribe to it rather
  // than mirroring it into state (same pattern as `useRecentSearches`).
  const recents = useSyncExternalStore(
    subscribeToPaletteRecents,
    getPaletteRecentsSnapshot,
    getPaletteRecentsServerSnapshot,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open);

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

  // The nav's search field and the mobile search icon open it by event.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  if (!open) {
    return null;
  }

  const q = query.trim().toLowerCase();
  // Empty query → what you actually use, then everything else. A cold start
  // (no recents yet) still shows the full list, so nothing is ever hidden.
  const recentHrefs = new Set(recents.map((r) => r.href));
  const recentPages: PageResult[] = q
    ? []
    : recents.map((r) => ({ kind: "page" as const, label: r.label, href: r.href }));
  const pageMatches = q
    ? PAGES.filter((p) => p.label.toLowerCase().includes(q))
    : [...recentPages, ...PAGES.filter((p) => !recentHrefs.has(p.href))];
  const showTitles = q.length >= 2;
  const results: Result[] = [
    ...pageMatches,
    ...(showTitles ? animeResults : []),
    ...(showTitles ? mangaResults : []),
  ];
  const active = Math.min(activeIndex, Math.max(0, results.length - 1));
  const recentCount = recentPages.length;

  function go(result: Result) {
    close();
    if (result.kind === "page") {
      pushPaletteRecent({ label: result.label, href: result.href });
      // The href test is not redundant with the flag: recents are replayed from
      // storage as bare {label, href} pairs, so a previously-used off-site link
      // arrives here with `external` undefined.
      if (result.external || /^https?:\/\//i.test(result.href)) {
        // `router.push` on an absolute URL leaves the palette closed and the
        // page unchanged — the App Router has no route to match. Open the tab
        // explicitly instead, and never without `noopener`.
        window.open(result.href, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(result.href);
    } else {
      router.push(resultHref(result));
    }
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

      <div
        ref={panelRef}
        className="glass relative w-full max-w-lg overflow-hidden rounded-xl border border-border shadow-2xl"
      >
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
            placeholder="Jump to a page or search anime and manga…"
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
          aria-busy={searching}
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {!showTitles
                ? "Type to search…"
                : searching
                  ? "Searching…"
                  : "Nothing matches."}
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.kind === "page" ? r.href : `${r.kind}-${resultHref(r)}`}>
                {/* Section labels, rendered inline so the flat listbox and its
                    arrow-key indexing stay untouched. */}
                {recentCount > 0 && i === 0 ? <GroupLabel>Recent</GroupLabel> : null}
                {recentCount > 0 && i === recentCount ? (
                  <GroupLabel>All pages</GroupLabel>
                ) : null}
                {showTitles && r.kind === "anime" && results[i - 1]?.kind === "page" ? (
                  <GroupLabel>Anime</GroupLabel>
                ) : null}
                {showTitles && r.kind === "manga" && results[i - 1]?.kind !== "manga" ? (
                  <GroupLabel>Manga</GroupLabel>
                ) : null}
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
                      {recentCount > 0 && i < recentCount ? (
                        <Clock className="size-4 shrink-0 opacity-60" aria-hidden />
                      ) : (
                        <Clapperboard className="size-4 shrink-0 opacity-60" aria-hidden />
                      )}
                      <span className="flex-1">{r.label}</span>
                      <span className="text-xs opacity-50">{r.href}</span>
                    </>
                  ) : (
                    <>
                      <span className="relative aspect-[2/3] w-6 shrink-0 overflow-hidden rounded bg-muted">
                        {r.posterUrl ? (
                          <Image src={posterUrl(r.posterUrl, "card")!} alt="" fill sizes="24px" className="object-cover" />
                        ) : null}
                      </span>
                      <span className="line-clamp-1 flex-1">{r.title}</span>
                      {r.kind === "anime" && r.inLibrary ? (
                        <span className="text-xs opacity-50">In library</span>
                      ) : r.kind === "anime" && r.year != null ? (
                        <span className="text-xs opacity-50">{r.year}</span>
                      ) : null}
                      {r.kind === "manga" ? (
                        <BookOpen className="size-3.5 shrink-0 opacity-50" aria-hidden />
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

        {/* The shortcuts were invisible; now they're printed on the thing that
            uses them. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <Hint keys={["↑", "↓"]}>navigate</Hint>
          <Hint keys={["↵"]}>open</Hint>
          <Hint keys={["esc"]}>close</Hint>
          <Hint keys={["⌘", "K"]}>anywhere</Hint>
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      aria-hidden
      className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70"
    >
      {children}
    </p>
  );
}

function Hint({
  keys,
  children,
}: {
  keys: string[];
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-border px-1 py-0.5 font-sans text-[10px] leading-none"
        >
          {k}
        </kbd>
      ))}
      {children}
    </span>
  );
}

"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { LibraryEntryItem } from "@/app/actions/library";
import { useDebounce } from "@/hooks/use-debounce";
import type { JikanAnime, JikanManga } from "@/lib/jikan";

/**
 * The ⌘K palette's title search, layered so something useful is on screen at
 * every moment instead of a blank list waiting on Jikan:
 *
 *  1. **Your library**, matched on every keystroke from the TanStack cache the
 *     /library grid already keeps (and persists to IndexedDB). Zero network.
 *  2. **The previous answer, narrowed.** While a new query loads, the last
 *     results stay up, filtered to titles that still contain what's typed — so
 *     the list sharpens as you type rather than flashing empty.
 *  3. **The search** (`limit=6`), which answers from the local catalog first
 *     (see the route): one database query, plus whatever the live engines
 *     manage within a short grace window. If they didn't, the answer comes
 *     back `partial`, and is asked for again a moment later — by then the
 *     live search has landed in the server's caches and merges in.
 *
 * Every answer is cached per query for ten minutes, so backspacing and
 * retyping never refetches. Requests carry TanStack's abort signal, so a
 * superseded keystroke cancels its fetch — and, server-side, gives back its
 * place in AniList's queue.
 */

export type PaletteAnime = {
  kind: "anime";
  malId: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  /** Matched from the user's own library rather than a search engine. */
  inLibrary?: boolean;
  /** Every known title, lowercased — what narrowing matches against. */
  match: string;
};

export type PaletteManga = {
  kind: "manga";
  /** MangaDex-only titles have no MAL id and open on the /manga/md route. */
  malId: number | null;
  mangadexId: string | null;
  title: string;
  posterUrl: string | null;
  match: string;
};

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const ANIME_ROWS = 6;
const MANGA_ROWS = 4;
/** Library hits lead the anime rows but never crowd out the live results. */
const LIBRARY_ROWS = 3;
const CACHE_MS = 10 * 60_000;
/** When a `partial` answer is asked for again, and how many times at most. */
const PARTIAL_REFETCH_MS = 1_500;
const PARTIAL_REFETCHES = 2;

/** The key `/library`'s grid caches the user's list under. */
const LIBRARY_QUERY_KEY = ["user-library"] as const;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()) as T;
}

const matchText = (...titles: (string | null | undefined)[]) =>
  titles.filter(Boolean).join("\n").toLowerCase();

function toAnime(a: JikanAnime): PaletteAnime {
  return {
    kind: "anime",
    malId: a.mal_id,
    title: a.title_english ?? a.title,
    posterUrl: a.images?.jpg?.image_url ?? null,
    year: a.year,
    match: matchText(a.title, a.title_english, ...(a.title_synonyms ?? [])),
  };
}

function toManga(m: JikanManga): PaletteManga {
  return {
    kind: "manga",
    malId: m.mal_id,
    mangadexId: m.mangadex_id ?? null,
    title: m.title_english ?? m.title,
    posterUrl: m.images?.jpg?.image_url ?? null,
    match: matchText(m.title, m.title_english, ...(m.title_synonyms ?? [])),
  };
}

const animeUrl = (q: string) =>
  `/api/anime/search?q=${encodeURIComponent(q)}&limit=${ANIME_ROWS}`;

type AnimeAnswer = { rows: PaletteAnime[]; partial: boolean };

export function usePaletteSearch(open: boolean, query: string) {
  const queryClient = useQueryClient();
  const typed = query.trim().toLowerCase();
  const debounced = useDebounce(typed, DEBOUNCE_MS);
  const enabled = open && debounced.length >= MIN_CHARS;

  const search = useQuery<AnimeAnswer>({
    queryKey: ["palette", "anime", debounced],
    queryFn: ({ signal }) =>
      getJson<{ results?: JikanAnime[]; partial?: boolean }>(animeUrl(debounced), signal).then(
        (body) => ({ rows: (body.results ?? []).map(toAnime), partial: Boolean(body.partial) }),
      ),
    enabled,
    staleTime: CACHE_MS,
    gcTime: CACHE_MS,
    placeholderData: keepPreviousData,
    // The catalog answered alone; the live engines are still filling the
    // server's caches. Ask again shortly — a bounded number of times.
    refetchInterval: (query) =>
      query.state.data?.partial && query.state.dataUpdateCount <= PARTIAL_REFETCHES
        ? PARTIAL_REFETCH_MS
        : false,
  });

  const manga = useQuery<PaletteManga[]>({
    queryKey: ["palette", "manga", debounced],
    queryFn: ({ signal }) =>
      getJson<{ results?: JikanManga[] }>(
        `/api/manga/search?q=${encodeURIComponent(debounced)}&limit=${MANGA_ROWS}`,
        signal,
      ).then((body) => (body.results ?? []).map(toManga)),
    enabled,
    staleTime: CACHE_MS,
    gcTime: CACHE_MS,
    placeholderData: keepPreviousData,
  });

  if (!open || typed.length < MIN_CHARS) {
    return { anime: [], manga: [], searching: false };
  }

  // A result set answers `typed` exactly only if it is this key's own data
  // and the debounce has caught up; anything else is narrowed to what still
  // matches.
  const exact = (isPlaceholder: boolean) => !isPlaceholder && debounced === typed;
  const narrow = <T extends { match: string }>(
    list: T[] | undefined,
    isExact: boolean,
  ): T[] => (!list ? [] : isExact ? list : list.filter((r) => r.match.includes(typed)));

  const library = queryClient.getQueryData<LibraryEntryItem[]>(LIBRARY_QUERY_KEY) ?? [];
  const libraryHits: PaletteAnime[] = [];
  for (const item of library) {
    if (libraryHits.length >= LIBRARY_ROWS) break;
    if (item.malId == null) continue;
    const match = matchText(item.title, item.titleEnglish);
    if (!match.includes(typed)) continue;
    libraryHits.push({
      kind: "anime",
      malId: item.malId,
      title: item.titleEnglish ?? item.title,
      posterUrl: item.posterUrl,
      year: null,
      inLibrary: true,
      match,
    });
  }

  const remote = narrow(search.data?.rows, exact(search.isPlaceholderData));

  const seen = new Set<number>();
  const anime = [...libraryHits, ...remote]
    .filter((a) => !seen.has(a.malId) && Boolean(seen.add(a.malId)))
    .slice(0, ANIME_ROWS);

  return {
    anime,
    manga: narrow(manga.data, exact(manga.isPlaceholderData)).slice(0, MANGA_ROWS),
    // A partial answer's follow-up is enrichment, not a wait: no spinner for it.
    searching:
      enabled &&
      ((search.isFetching && (search.isPlaceholderData || search.data === undefined)) ||
        manga.isFetching),
  };
}

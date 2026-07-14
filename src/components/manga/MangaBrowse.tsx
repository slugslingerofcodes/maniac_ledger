"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getUserMangaLibrary,
  type MangaSearchResult,
} from "@/app/actions/manga";
import { MANGA_LIBRARY_QUERY_KEY } from "@/components/manga/MangaLibraryGridClient";
import { MangaPosterCard } from "@/components/manga/MangaPosterCard";
import { Pagination } from "@/components/anime/Pagination";
import { SourceNotice } from "@/components/SourceNotice";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { genreChipStyle } from "@/lib/genre-color";
import { GENRE_OPTIONS } from "@/lib/genres";
import { cn } from "@/lib/utils";
import type { JikanManga } from "@/lib/jikan";

type Status = "loading" | "success" | "error";

/**
 * One browse tab: a label plus the search function it runs. The function takes
 * the query, page, and selected MAL genre ids and returns the shared
 * MangaSearchResult. Different tabs plug in different engines (searchMangaAction
 * for MAL-first formats, searchWebComicsAction for MangaDex webcomics, etc.).
 */
export type MangaBrowseTab = {
  key: string;
  label: string;
  run: (
    query: string,
    page: number,
    genreIds: number[],
  ) => Promise<MangaSearchResult>;
};

/**
 * Shared browse/search UI for the manga framework: tabs (hidden when only one),
 * a search bar, MAL-genre chip filters, and a poster grid. Each tab supplies
 * its own `run` function, so the same UI powers /manga/search, /manga/
 * lightnovels, and /manga/web with different data sources.
 */
export function MangaBrowse({
  title,
  subtitle,
  tabs,
}: {
  title: string;
  subtitle?: string;
  tabs: MangaBrowseTab[];
}) {
  const [tabKey, setTabKey] = useState<string>(tabs[0]!.key);
  const [query, setQuery] = useState("");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 400);

  const activeTab = tabs.find((t) => t.key === tabKey) ?? tabs[0]!;
  // Callers pass fresh tab objects each render, so the fetch effect keys off
  // tabKey (stable) and reads the current tab's run via a ref — avoids a
  // re-run loop. The ref is refreshed in its own effect (never during render),
  // declared first so it's current before the fetch effect below reads it.
  const runRef = useRef(activeTab.run);
  useEffect(() => {
    runRef.current = activeTab.run;
  });

  const [results, setResults] = useState<JikanManga[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");
  const [degraded, setDegraded] = useState(false);
  const [source, setSource] = useState<string>("mal");

  // Highlight manga already in the library.
  const { data: library } = useQuery({
    queryKey: MANGA_LIBRARY_QUERY_KEY,
    queryFn: () => getUserMangaLibrary(),
    staleTime: 5 * 60_000,
  });
  const libraryMalIds = new Set(
    (library ?? [])
      .map((i) => i.malId)
      .filter((id): id is number => id != null),
  );
  const libraryMdIds = new Set(
    (library ?? [])
      .map((i) => i.mangadexId)
      .filter((id): id is string => id != null),
  );
  const inLibrary = (m: JikanManga) =>
    m.mal_id != null
      ? libraryMalIds.has(m.mal_id)
      : m.mangadex_id != null && libraryMdIds.has(m.mangadex_id);

  function toggleGenre(id: number) {
    setPage(1);
    setGenreIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    runRef
      .current(debouncedQuery, page, genreIds)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setResults(res.results);
          setTotalPages(res.totalPages);
          setDegraded(res.degraded);
          setSource(res.source);
          setStatus("success");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page, tabKey, genreIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function goToPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeLabel = activeTab.label;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-1 text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle ? (
        <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
      ) : (
        <div className="mb-4" />
      )}

      {tabs.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={tabKey === tab.key}
              onClick={() => {
                setTabKey(tab.key);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                tabKey === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Per-tab filter system: search bar + genre chips. */}
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={`Search ${activeLabel.toLowerCase()}… (or browse popular)`}
        aria-label={`Search ${activeLabel}`}
        className="mb-3 h-10 max-w-md"
      />

      <div className="mb-6 flex flex-wrap gap-1.5">
        {GENRE_OPTIONS.map((g) => {
          const active = genreIds.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggleGenre(g.id)}
              aria-pressed={active}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "hover:brightness-125",
              )}
              style={active ? undefined : genreChipStyle(g.name)}
            >
              {g.name}
            </button>
          );
        })}
        {genreIds.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setGenreIds([]);
              setPage(1);
            }}
            className="rounded-full px-3 py-1 text-xs font-medium text-destructive hover:underline"
          >
            Clear ✕
          </button>
        ) : null}
      </div>

      {status === "success" ? (
        <SourceNotice source={source} degraded={degraded} />
      ) : null}

      {status === "loading" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Search is unavailable right now. Please try again.
        </p>
      ) : null}

      {status === "success" && results.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Nothing found — try another title or fewer genres.
        </p>
      ) : null}

      {status === "success" && results.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((manga) => (
              <MangaPosterCard
                key={manga.mal_id ?? manga.mangadex_id}
                manga={manga}
                alreadyInLibrary={inLibrary(manga)}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
        </>
      ) : null}
    </main>
  );
}

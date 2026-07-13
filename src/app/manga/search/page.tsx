"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUserMangaLibrary, searchMangaAction } from "@/app/actions/manga";
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
import type { JikanManga, JikanMangaType } from "@/lib/jikan";

type Status = "loading" | "success" | "error";

/** The format tabs — each gets its own search bar + genre filter. */
const FORMAT_TABS: { value: JikanMangaType; label: string }[] = [
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "lightnovel", label: "Light Novels" },
];

export default function MangaSearchPage() {
  const [format, setFormat] = useState<JikanMangaType>("manga");
  const [query, setQuery] = useState("");
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 400);

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
    searchMangaAction(debouncedQuery, page, format, genreIds)
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
  }, [debouncedQuery, page, format, genreIds]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function goToPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-4 text-2xl font-semibold tracking-tight">
        Search
      </h1>

      {/* Format tabs: Manga / Manhwa / Manhua / Light Novels */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FORMAT_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={format === tab.value}
            onClick={() => {
              setFormat(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              format === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Per-tab filter system: search bar + genre chips. */}
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={`Search ${FORMAT_TABS.find((t) => t.value === format)!.label.toLowerCase()}… (or browse popular)`}
        aria-label="Search"
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
                key={manga.mal_id}
                manga={manga}
                alreadyInLibrary={libraryMalIds.has(manga.mal_id)}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
        </>
      ) : null}
    </main>
  );
}

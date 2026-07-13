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
import { cn } from "@/lib/utils";
import type { JikanManga, JikanMangaType } from "@/lib/jikan";

type Status = "loading" | "success" | "error";
type FormatTab = "all" | JikanMangaType;

const FORMAT_TABS: { value: FormatTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
];

export default function MangaSearchPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [format, setFormat] = useState<FormatTab>("all");
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    searchMangaAction(
      debouncedQuery,
      page,
      format === "all" ? undefined : format,
    )
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
  }, [debouncedQuery, page, format]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function goToPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-4 text-2xl font-semibold tracking-tight">
        Search manga
      </h1>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search manga… (or leave empty to browse popular)"
          aria-label="Search manga"
          className="h-10 max-w-md"
        />
        {/* Format tabs: All / Manga / Manhwa / Manhua */}
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
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
                "px-3 py-2 text-sm font-medium transition-colors",
                format === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
          Manga search is unavailable right now. Please try again.
        </p>
      ) : null}

      {status === "success" && results.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          No manga found.
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

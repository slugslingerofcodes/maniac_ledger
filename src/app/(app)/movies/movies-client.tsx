"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Pagination } from "@/components/anime/Pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { genreChipStyle } from "@/lib/genre-color";
import { GENRE_OPTIONS } from "@/lib/genres";
import { cn } from "@/lib/utils";
import type { JikanAnime } from "@/lib/jikan";

/**
 * Filterable, paginated movie browser. Runs on the same /api/anime/search
 * engine as the search page (format=movie), so it inherits the MAL → AniList →
 * catalog fallback chain, popularity ordering, and ≤50-result pages.
 */
export function MoviesClient() {
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [movies, setMovies] = useState<JikanAnime[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const abortRef = useRef<AbortController | null>(null);

  function toggleGenre(id: number) {
    setPage(1);
    setGenreIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }

  function goToPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    const params = new URLSearchParams({ format: "movie", page: String(page) });
    if (genreIds.length > 0) params.set("genres", genreIds.join(","));

    fetch(`/api/anime/search?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Movie fetch failed");
        const body = await res.json();
        const seen = new Set<number>();
        const unique = ((body.results ?? []) as JikanAnime[]).filter((a) => {
          if (seen.has(a.mal_id)) return false;
          seen.add(a.mal_id);
          return true;
        });
        setMovies(unique);
        setTotalPages(body.totalPages ?? 1);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [genreIds, page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <>
      {/* Genre filter chips */}
      <div className="mt-5 flex flex-wrap gap-1.5">
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

      {status === "loading" ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load movies right now. Please try again later.
        </p>
      ) : null}

      {status === "success" && movies.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No movies match those genres.
        </p>
      ) : null}

      {status === "success" && movies.length > 0 ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {movies.map((movie) => {
              const poster =
                movie.images?.jpg?.large_image_url ??
                movie.images?.jpg?.image_url ??
                null;
              return (
                <Link
                  key={movie.mal_id}
                  href={`/anime/mal/${movie.mal_id}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
                    {poster ? (
                      <Image
                        src={poster}
                        alt={movie.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    {movie.score != null ? (
                      <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
                        ★ {movie.score}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {movie.title_english ?? movie.title}
                  </p>
                </Link>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
        </>
      ) : null}
    </>
  );
}

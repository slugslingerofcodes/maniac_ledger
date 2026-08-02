"use client";

import Image from "next/image";
import { useState } from "react";

import { MorphLink } from "@/components/MorphLink";
import { posterTransitionName } from "@/lib/view-transition";

import { Pagination } from "@/components/anime/Pagination";
import { PosterGridSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { useAnimeFeed } from "@/hooks/use-anime-feed";
import { genreChipStyle } from "@/lib/genre-color";
import { GENRE_OPTIONS } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * Filterable, paginated movie browser. Runs on the same /api/anime/search
 * engine as the search page (format=movie), so it inherits the MAL → AniList →
 * catalog fallback chain, popularity ordering, and ≤50-result pages.
 */
export function MoviesClient() {
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  const { data, isError, showSkeleton, isRefreshing } = useAnimeFeed({
    endpoint: "/api/anime/search",
    params: {
      format: "movie",
      page,
      // Sorted so picking the same genres in a different order is one cache
      // entry, not two.
      genres: genreIds.length > 0 ? [...genreIds].sort((a, b) => a - b).join(",") : undefined,
    },
  });
  const movies = data?.results ?? [];
  const totalPages = data?.totalPages ?? 1;

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

      {showSkeleton ? (
        <PosterGridSkeleton
          className="mt-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          count={12}
        />
      ) : null}

      {isError && !data ? (
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load movies right now. Please try again later.
        </p>
      ) : null}

      {!showSkeleton && movies.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No movies match those genres.
        </p>
      ) : null}

      {movies.length > 0 ? (
        <>
          <div
            className={cn(
              "mt-6 grid grid-cols-2 gap-4 transition-opacity duration-200 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
              isRefreshing && "opacity-50",
            )}
          >
            {movies.map((movie) => {
              const poster =
                movie.images?.jpg?.large_image_url ??
                movie.images?.jpg?.image_url ??
                null;
              return (
                <MorphLink
                  key={movie.mal_id}
                  href={`/anime/mal/${movie.mal_id}`}
                  name={posterTransitionName(movie.mal_id)}
                  className="group flex flex-col gap-2"
                >
                  <div data-morph className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
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
                </MorphLink>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
        </>
      ) : null}
    </>
  );
}

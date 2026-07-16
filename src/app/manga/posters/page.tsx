"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchAnimePosters, type AnimePoster } from "@/app/actions/posters";
import { PosterLightbox } from "@/components/PosterLightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";

/** What the last completed fetch returned, tagged with the request it answered. */
type Loaded = {
  query: string;
  page: number;
  posters: AnimePoster[];
  degraded: boolean;
  error: string | null;
  hasMore: boolean;
};

/**
 * Anime Posters — every key visual MAL holds for a title, in one grid.
 *
 * A show ships a different number of posters before it airs (teasers, per-cour
 * keys, character visuals), so counts vary wildly; they're all flattened
 * together here. The search box acts on the *anime*: type a title and the grid
 * becomes that show's posters. Empty query browses the current top titles.
 */
export default function AnimePostersPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 450);
  const [page, setPage] = useState(1);
  // Bumped to re-run the *same* page after a failure — MAL 504s often enough
  // that a dead end with no way back is a real outcome, not a hypothetical.
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // A new search restarts paging. Adjusting during render is React's sanctioned
  // alternative to a reset effect (and keeps the lint rule happy).
  const [seenQuery, setSeenQuery] = useState(debouncedQuery);
  if (seenQuery !== debouncedQuery) {
    setSeenQuery(debouncedQuery);
    setPage(1);
  }

  useEffect(() => {
    let active = true;
    fetchAnimePosters(debouncedQuery, page)
      .then((res) => {
        if (!active) return;
        setLoaded((prev) => {
          // Page 1 replaces; later pages append to what's already shown.
          const base =
            page > 1 && prev && prev.query === debouncedQuery ? prev.posters : [];
          if (!res.ok) {
            return {
              query: debouncedQuery,
              page,
              posters: base,
              degraded: false,
              error: res.error,
              // Page 1 failing means there's nothing to page through. A later
              // page failing is retryable — keep the control on screen.
              hasMore: page > 1,
            };
          }
          const seen = new Set(base.map((p) => p.id));
          return {
            query: debouncedQuery,
            page,
            posters: [...base, ...res.posters.filter((p) => !seen.has(p.id))],
            degraded: res.degraded,
            error: null,
            hasMore: res.hasMore,
          };
        });
      })
      .catch(() => {
        if (!active) return;
        setLoaded((prev) => ({
          query: debouncedQuery,
          page,
          posters: page > 1 && prev ? prev.posters : [],
          degraded: false,
          error: "Couldn't load posters right now.",
          hasMore: page > 1,
        }));
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, page, retry]);

  // Derived, not stored: we're loading whenever what we hold doesn't answer
  // what we last asked for. Keeps every setState inside the promise callback.
  const settled = loaded?.query === debouncedQuery && loaded?.page === page;
  const loadingFirst = !settled && page === 1;
  const loadingMore = !settled && page > 1;
  const posters = loaded?.query === debouncedQuery ? loaded.posters : [];
  const error = settled ? (loaded?.error ?? null) : null;
  const degraded = loaded?.degraded ?? false;
  const hasMore = settled ? (loaded?.hasMore ?? false) : false;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-1 text-2xl font-semibold tracking-tight">
        Anime Posters
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Every key visual a show has published — teasers, cour keys, character
        art. Search a title to see all of its posters; tap any one to view it
        full size.
      </p>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search an anime — e.g. Frieren, Jujutsu Kaisen…"
        aria-label="Search anime posters"
        className="mb-6 max-w-md"
      />

      {loadingFirst ? (
        <PosterGridSkeleton />
      ) : error && posters.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {error}
        </p>
      ) : posters.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          {debouncedQuery.trim()
            ? `No posters found for “${debouncedQuery.trim()}”.`
            : "No posters to show right now."}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {posters.length} poster{posters.length === 1 ? "" : "s"}
            {degraded ? " · some titles couldn’t be loaded" : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {posters.map((p) => (
              <PosterTile key={p.id} poster={p} />
            ))}
          </div>

          <div className="mt-6 flex flex-col items-center gap-2">
            {error ? (
              <p className="text-xs text-muted-foreground" role="status">
                {error}
              </p>
            ) : null}
            {hasMore || loadingMore ? (
              <Button
                type="button"
                variant="secondary"
                disabled={loadingMore}
                // After a failure, re-run the page that failed rather than
                // advancing past it — otherwise a retry would skip its titles.
                onClick={() =>
                  error ? setRetry((n) => n + 1) : setPage((p) => p + 1)
                }
              >
                {loadingMore ? "Loading…" : error ? "Try again" : "Load more"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                That’s every poster we have for this.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function PosterTile({ poster }: { poster: AnimePoster }) {
  return (
    <figure className="group relative flex flex-col gap-1.5">
      <PosterLightbox src={poster.url} alt={poster.animeTitle}>
        <div className="relative aspect-[2/3] w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40">
          <Image
            src={poster.thumbUrl}
            alt={poster.animeTitle}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </PosterLightbox>
      <figcaption className="min-w-0">
        <Link
          href={`/anime/mal/${poster.animeMalId}`}
          className="line-clamp-1 text-xs font-medium hover:text-primary"
        >
          {poster.animeTitle}
        </Link>
        {poster.year != null ? (
          <p className="text-[11px] text-muted-foreground">{poster.year}</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

function PosterGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

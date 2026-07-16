"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchAnimePosters,
  type AnimePoster,
  type PostersSource,
} from "@/app/actions/posters";
import { PosterLightbox } from "@/components/PosterLightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";

/** What the last completed fetch returned, tagged with the query it answered. */
type Loaded = {
  query: string;
  posters: AnimePoster[];
  degraded: boolean;
  source: PostersSource;
  error: string | null;
};

/** Degraded-mode notice, worded by which engine actually answered. */
function degradedNotice(source: PostersSource): string {
  if (source === "anilist")
    return " · MyAnimeList is down — showing each title's cover from AniList";
  if (source === "catalog")
    return " · live sources are down — showing covers from the local catalog";
  return " · some titles couldn’t be loaded";
}

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
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    fetchAnimePosters(debouncedQuery)
      .then((res) => {
        if (!active) return;
        setLoaded(
          res.ok
            ? {
                query: debouncedQuery,
                posters: res.posters,
                degraded: res.degraded,
                source: res.source,
                error: null,
              }
            : {
                query: debouncedQuery,
                posters: [],
                degraded: false,
                source: "mal",
                error: res.error,
              },
        );
      })
      .catch(() => {
        if (!active) return;
        setLoaded({
          query: debouncedQuery,
          posters: [],
          degraded: false,
          source: "mal",
          error: "Couldn't load posters right now.",
        });
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  // Derived, not stored: we're loading whenever what we hold doesn't answer
  // what we last asked for. Keeps every setState inside the promise callback.
  const loading = loaded?.query !== debouncedQuery;
  const posters = loaded?.posters ?? [];
  const error = loaded?.error ?? null;
  const degraded = loaded?.degraded ?? false;

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

      {loading ? (
        <PosterGridSkeleton />
      ) : error ? (
        <div className="flex flex-col items-start gap-3" role="status">
          <p className="text-sm text-muted-foreground">{error}</p>
          {query.trim() ? (
            <Button size="sm" variant="outline" onClick={() => setQuery("")}>
              Browse top titles instead
            </Button>
          ) : null}
        </div>
      ) : posters.length === 0 ? (
        <div className="flex flex-col items-start gap-3" role="status">
          <p className="text-sm text-muted-foreground">
            {debouncedQuery.trim()
              ? `No posters found for “${debouncedQuery.trim()}”.`
              : "No posters to show right now."}
          </p>
          {debouncedQuery.trim() ? (
            <Button size="sm" variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {posters.length} poster{posters.length === 1 ? "" : "s"}
            {degraded ? degradedNotice(loaded?.source ?? "mal") : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {posters.map((p) => (
              <PosterTile key={p.id} poster={p} />
            ))}
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

"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addToLibraryAction } from "@/app/actions/library";
import { useDebounce } from "@/hooks/use-debounce";
import type { JikanAnime } from "@/lib/jikan";

type Status = "idle" | "loading" | "success" | "error";

/** Best available poster for a Jikan record. */
function posterOf(anime: JikanAnime): string | null {
  return (
    anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url ?? null
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);

  const [results, setResults] = useState<JikanAnime[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  // The query that produced the current `results`, for the no-results message.
  const [resolvedQuery, setResolvedQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = debouncedQuery.trim();

    // Cancel any in-flight request whenever the debounced query changes.
    abortRef.current?.abort();

    // The API requires q >= 2 chars; treat anything shorter as the idle prompt.
    if (q.length < 2) {
      setStatus("idle");
      setResults([]);
      setResolvedQuery("");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Search request failed");
        const body = await res.json();
        // Jikan can return the same mal_id more than once; dedupe so cards keep
        // stable, unique React keys.
        const seen = new Set<number>();
        const unique = ((body.results ?? []) as JikanAnime[]).filter((a) => {
          if (seen.has(a.mal_id)) return false;
          seen.add(a.mal_id);
          return true;
        });
        setResults(unique);
        setResolvedQuery(q);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      {/* Centered search input */}
      <div className="mx-auto mb-10 max-w-xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime…"
            aria-label="Search anime"
            className="h-11 rounded-xl text-center text-base"
          />
        </div>

        {status === "idle" ? (
          <Hint>Start typing to discover anime…</Hint>
        ) : null}

        {status === "loading" ? <SkeletonGrid /> : null}

        {status === "error" ? (
          <Hint>Something went wrong. Please try again.</Hint>
        ) : null}

        {status === "success" && results.length === 0 ? (
          <Hint>No anime found for “{resolvedQuery}”</Hint>
        ) : null}

        {status === "success" && results.length > 0 ? (
          <Grid>
            {results.map((anime) => (
              <PosterCard key={anime.mal_id} anime={anime} />
            ))}
          </Grid>
        ) : null}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {children}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <Grid>
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
      ))}
    </Grid>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-24 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function PosterCard({ anime }: { anime: JikanAnime }) {
  const poster = posterOf(anime);
  const title = anime.title_english ?? anime.title;

  return (
    <div className="group flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border">
        {poster ? (
          <Image
            src={poster}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}

        {/* Score badge — top right */}
        {anime.score != null ? (
          <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
            ★ {anime.score}
          </Badge>
        ) : null}

        {/* Title overlay — fades in on hover */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/60 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
        </div>
      </div>

      <AddButton anime={anime} />
    </div>
  );
}

function AddButton({ anime }: { anime: JikanAnime }) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onAdd() {
    setError(null);
    // Optimistic: flip to "Added ✓" immediately, revert if the action fails.
    setAdded(true);
    startTransition(async () => {
      const res = await addToLibraryAction(anime);
      if (!res.ok) {
        setAdded(false);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={added ? "secondary" : "default"}
        className="w-full"
        disabled={added || pending}
        onClick={onAdd}
      >
        {added ? "Added ✓" : "+ Add"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

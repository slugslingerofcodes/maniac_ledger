"use client";

import { useRef, useState } from "react";

import type { AnimeSearchResult } from "@/app/api/anime/search/route";
import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "results"; query: string; results: AnimeSearchResult[] };

export function SearchClient() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    // Cancel any in-flight request before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body?.error ?? "Search failed." });
        return;
      }
      setState({
        kind: "results",
        query: q,
        results: (body.results ?? []) as AnimeSearchResult[],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({
        kind: "error",
        message: "Couldn't reach the search service. Please try again.",
      });
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title… (e.g. Naruto)"
          aria-label="Search anime"
          className="h-9"
        />
        <Button type="submit" disabled={state.kind === "loading" || !query.trim()}>
          {state.kind === "loading" ? "Searching…" : "Search"}
        </Button>
      </form>

      <div className="mt-6">
        {state.kind === "loading" ? <ResultsGridSkeleton /> : null}

        {state.kind === "error" ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}

        {state.kind === "results" && state.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No results for “{state.query}”.
          </p>
        ) : null}

        {state.kind === "results" && state.results.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {state.results.map((result) => (
              <ResultCard key={result.malId} result={result} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: AnimeSearchResult }) {
  return (
    <Card className="group flex flex-col gap-0 overflow-hidden py-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {result.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- poster hosts vary (MAL CDN); avoids next/image remote config.
          <img
            src={result.image}
            alt={result.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {result.score != null ? (
          <Badge className="absolute right-2 top-2 border-transparent bg-black/70 text-white backdrop-blur">
            ★ {result.score}
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <h3
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={result.title}
        >
          {result.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {result.episodes ? `${result.episodes} episodes` : "Episodes —"}
        </p>
        <div className="mt-auto pt-1">
          <AddToLibraryButton item={result} />
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}

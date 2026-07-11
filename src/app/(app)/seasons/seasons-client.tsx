"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Pagination } from "@/components/anime/Pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SEASONS,
  SEASON_LABELS,
  YEAR_MIN,
  type Season,
} from "@/lib/search-filters";
import { cn } from "@/lib/utils";
import type { JikanAnime } from "@/lib/jikan";

/** The anime season a date falls in (winter = Jan–Mar, … fall = Oct–Dec). */
function seasonOf(date: Date): Season {
  return SEASONS[Math.floor(date.getMonth() / 3)]!;
}

function shiftSeason(season: Season, year: number, delta: 1 | -1) {
  let idx = SEASONS.indexOf(season) + delta;
  let y = year;
  if (idx < 0) {
    idx = SEASONS.length - 1;
    y--;
  } else if (idx >= SEASONS.length) {
    idx = 0;
    y++;
  }
  return { season: SEASONS[idx]!, year: y };
}

/**
 * Season browser: pick any season+year and page through everything that
 * premiered in it, ranked by popularity. Served by the AniList engine (MAL has
 * no season search), via the shared /api/anime/search route.
 */
export function SeasonsClient() {
  const now = new Date();
  const maxYear = now.getFullYear() + 1;
  const [season, setSeason] = useState<Season>(() => seasonOf(now));
  const [year, setYear] = useState<number>(now.getFullYear());
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<JikanAnime[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const abortRef = useRef<AbortController | null>(null);

  function move(delta: 1 | -1) {
    const next = shiftSeason(season, year, delta);
    if (next.year < YEAR_MIN || next.year > maxYear) return;
    setSeason(next.season);
    setYear(next.year);
    setPage(1);
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    const params = new URLSearchParams({
      season,
      year: String(year),
      page: String(page),
    });
    fetch(`/api/anime/search?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Season fetch failed");
        const body = await res.json();
        const seen = new Set<number>();
        const unique = ((body.results ?? []) as JikanAnime[]).filter((a) => {
          if (seen.has(a.mal_id)) return false;
          seen.add(a.mal_id);
          return true;
        });
        setResults(unique);
        setTotalPages(body.totalPages ?? 1);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [season, year, page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <>
      {/* Season navigator */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous season"
            className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-36 text-center text-lg font-semibold">
            {SEASON_LABELS[season]} {year}
          </span>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next season"
            className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeason(s);
                setPage(1);
              }}
              aria-pressed={s === season}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                s === season
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {SEASON_LABELS[s]}
            </button>
          ))}
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Year"
            className="h-7 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30"
          >
            {Array.from({ length: maxYear - YEAR_MIN + 1 }, (_, i) => maxYear - i).map(
              (y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load this season. Please try again later.
        </p>
      ) : null}

      {status === "success" && results.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing found for {SEASON_LABELS[season]} {year}.
        </p>
      ) : null}

      {status === "success" && results.length > 0 ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((anime) => {
              const poster =
                anime.images?.jpg?.large_image_url ??
                anime.images?.jpg?.image_url ??
                null;
              return (
                <Link
                  key={anime.mal_id}
                  href={`/anime/mal/${anime.mal_id}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
                    {poster ? (
                      <Image
                        src={poster}
                        alt={anime.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    {anime.score != null ? (
                      <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
                        ★ {anime.score}
                      </Badge>
                    ) : null}
                    {anime.type ? (
                      <Badge className="absolute left-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
                        {anime.type}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {anime.title_english ?? anime.title}
                  </p>
                </Link>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      ) : null}
    </>
  );
}

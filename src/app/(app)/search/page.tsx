"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SlimeIllustration } from "@/components/SlimeIllustration";
import { TitleLanguageToggle } from "@/components/TitleLanguageToggle";
import { Pagination } from "@/components/anime/Pagination";
import {
  SearchFilters,
  createDefaultFilters,
  filtersToSearchParams,
  type SearchFilterState,
} from "@/components/anime/SearchFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addToLibraryAction, getUserLibrary } from "@/app/actions/library";
import { LIBRARY_QUERY_KEY } from "@/app/(app)/library/library-grid-client";
import { GENRE_OPTIONS } from "@/lib/genres";
import { track } from "@/lib/analytics";
import { useDebounce } from "@/hooks/use-debounce";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  displayTitle,
  useTitleLanguage,
  type TitleLanguage,
} from "@/hooks/use-title-language";
import type { JikanAnime } from "@/lib/jikan";

type Status = "idle" | "loading" | "success" | "error";

/** Best available poster for a Jikan record. */
function posterOf(anime: JikanAnime): string | null {
  return (
    anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url ?? null
  );
}

/** useSearchParams requires a Suspense boundary on statically rendered pages. */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [titleLang] = useTitleLanguage();
  const debouncedQuery = useDebounce(query, 400);

  const [results, setResults] = useState<JikanAnime[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  // The query that produced the current `results`, for the no-results message.
  const [resolvedQuery, setResolvedQuery] = useState("");
  // Filter bar state. Genre ids are seeded from ?genres=<ids> so the home
  // genre ribbon can deep-link here.
  const [filters, setFilters] = useState<SearchFilterState>(() => {
    const raw = searchParams.get("genres");
    const valid = new Set(GENRE_OPTIONS.map((g) => g.id));
    const seeded = raw
      ? raw
          .split(",")
          .map(Number)
          .filter((id) => valid.has(id))
      : [];
    return createDefaultFilters(seeded);
  });
  const abortRef = useRef<AbortController | null>(null);

  // 1-based app page (≤50 results each) + totals from the API.
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<{
    totalPages: number;
    totalItems: number;
  } | null>(null);
  // Which engine served the results: "mal" | "anilist" | "catalog".
  const [source, setSource] = useState<string>("mal");
  // True when live APIs were down and results came from the local catalog.
  const [degraded, setDegraded] = useState(false);

  function goToPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Shares the same cache as the /library grid (persisted to IndexedDB), so we
  // can show "Added ✓" for results already in the library.
  const { data: library } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => getUserLibrary(),
    staleTime: 5 * 60_000,
  });
  const libraryMalIds = useMemo(
    () =>
      new Set(
        (library ?? [])
          .map((i) => i.malId)
          .filter((id): id is number => id != null),
      ),
    [library],
  );

  // This effect drives loading/result/idle state around an *aborted* fetch keyed
  // to the debounced query — a legitimate data-fetching effect. The synchronous
  // resets (clearing results when the box is emptied, flagging "loading" before
  // the request) are intentional, so the set-state-in-effect rule is a false
  // positive here; disabling it beats contorting race-safe code.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = debouncedQuery.trim();
    const hasQuery = q.length >= 2;

    // Cancel any in-flight request whenever the inputs change.
    abortRef.current?.abort();

    // Need a >=2-char query and/or at least one active filter; else idle.
    const params = filtersToSearchParams(filters, q, page);
    if (!params) {
      setStatus("idle");
      setResults([]);
      setResolvedQuery("");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    fetch(`/api/anime/search?${params.toString()}`, {
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
        setPageInfo({
          totalPages: body.totalPages ?? 1,
          totalItems: body.totalItems ?? unique.length,
        });
        setSource(body.source ?? "mal");
        setDegraded(Boolean(body.degraded));
        setResolvedQuery(hasQuery ? q : "the selected filters");
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [debouncedQuery, filters, page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      {/* Title language preference — applies to results here and the library. */}
      <div className="mb-4 flex justify-center">
        <TitleLanguageToggle />
      </div>

      {/* Filter bar: search, genres, year, season, format + advanced panel. */}
      <SearchFilters
          query={query}
          onQueryChange={(q) => {
            setQuery(q);
            setPage(1);
          }}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />

        {status === "idle" ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <SlimeIllustration className="w-44" />
            <p className="text-sm text-muted-foreground">
              Start typing or pick a filter to discover anime…
            </p>
          </div>
        ) : null}

        {status === "loading" ? <SkeletonGrid /> : null}

        {status === "error" ? (
          <Hint>Something went wrong. Please try again.</Hint>
        ) : null}

        {status === "success" && results.length === 0 ? (
          <Hint>No anime found for “{resolvedQuery}”</Hint>
        ) : null}

        {status === "success" && degraded ? (
          <p className="mx-auto mb-4 max-w-xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
            Live search is unreachable — showing matches from the local
            catalog until it recovers.
          </p>
        ) : null}

        {status === "success" && source === "anilist" ? (
          <p className="mb-4 text-center text-[11px] text-muted-foreground">
            Results via AniList
          </p>
        ) : null}

        {status === "success" && results.length > 0 ? (
          <>
            {pageInfo ? (
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Page {page} of {pageInfo.totalPages} ·{" "}
                {pageInfo.totalItems.toLocaleString()} matches
              </p>
            ) : null}
            <Grid>
              {results.map((anime) => (
                <PosterCard
                  key={anime.mal_id}
                  anime={anime}
                  titleLang={titleLang}
                  alreadyInLibrary={libraryMalIds.has(anime.mal_id)}
                />
              ))}
            </Grid>
            {pageInfo ? (
              <Pagination
                page={page}
                totalPages={pageInfo.totalPages}
                onPage={goToPage}
              />
            ) : null}
          </>
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

function PosterCard({
  anime,
  titleLang,
  alreadyInLibrary,
}: {
  anime: JikanAnime;
  titleLang: TitleLanguage;
  alreadyInLibrary: boolean;
}) {
  const poster = posterOf(anime);
  const title = displayTitle(titleLang, anime.title, anime.title_english);

  return (
    <div className="group relative isolate flex flex-col gap-2">
      {/* Ambient glow: the poster itself, blurred, spilling past the card. */}
      {poster ? (
        <div
          aria-hidden
          className="absolute inset-x-3 top-3 -z-10 aspect-[2/3] scale-105 opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
        >
          <Image src={poster} alt="" fill sizes="200px" className="object-cover" />
        </div>
      ) : null}
      <Link
        href={`/anime/mal/${anime.mal_id}`}
        aria-label={`View details for ${title}`}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
      >
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
          {anime.title_synonyms && anime.title_synonyms.length > 0 ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              aka {anime.title_synonyms.slice(0, 3).join(" · ")}
            </p>
          ) : null}
        </div>
      </Link>

      <AddButton anime={anime} alreadyInLibrary={alreadyInLibrary} />
    </div>
  );
}

function AddButton({
  anime,
  alreadyInLibrary,
}: {
  anime: JikanAnime;
  alreadyInLibrary: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const queryClient = useQueryClient();

  // Already in the library (from the cached query) OR just added this session.
  const added = alreadyInLibrary || justAdded;

  function onAdd() {
    if (!online) {
      toast.error("Connect to internet to add anime.");
      return;
    }
    setError(null);
    // Optimistic: flip to "Added ✓" immediately, revert if the action fails.
    setJustAdded(true);
    startTransition(async () => {
      const res = await addToLibraryAction(anime);
      if (!res.ok) {
        setJustAdded(false);
        setError(res.error);
      } else {
        // Refetch the library grid now instead of waiting out its 5-min
        // staleTime, so the new entry shows up on /library immediately.
        queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
        track("anime_added", {
          malId: anime.mal_id,
          title: anime.title,
          source: "search",
        });
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
        disabled={added || pending || !online}
        onClick={onAdd}
      >
        {added ? "Added ✓" : "+ Add"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

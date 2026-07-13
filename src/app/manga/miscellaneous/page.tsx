"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUserMangaLibrary, searchAdultMangaAction } from "@/app/actions/manga";
import { MANGA_LIBRARY_QUERY_KEY } from "@/components/manga/MangaLibraryGridClient";
import { MangaPosterCard } from "@/components/manga/MangaPosterCard";
import { Pagination } from "@/components/anime/Pagination";
import { SourceNotice } from "@/components/SourceNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import type { JikanManga, JikanMangaType } from "@/lib/jikan";

/** Same key as the anime miscellaneous tab — one 18+ confirmation covers both. */
const AGE_GATE_KEY = "misc_age_ok_v1";

type Status = "loading" | "success" | "error";
type FormatTab = "all" | Exclude<JikanMangaType, "lightnovel">;

const FORMAT_TABS: { value: FormatTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
];

export default function MangaMiscellaneousPage() {
  // null = unknown (pre-hydration), false = must confirm, true = confirmed.
  const [ageOk, setAgeOk] = useState<boolean | null>(null);

  // Read the one-time 18+ confirmation from localStorage on mount (same
  // legitimate persisted-flag pattern as the anime misc tab / ShareBanner).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      setAgeOk(window.localStorage.getItem(AGE_GATE_KEY) === "1");
    } catch {
      setAgeOk(false);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (ageOk === null) return null;
  if (!ageOk) return <AgeGate onConfirm={() => setAgeOk(true)} />;
  return <AdultMangaBrowser />;
}

function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  const router = useRouter();
  function confirm() {
    try {
      window.localStorage.setItem(AGE_GATE_KEY, "1");
    } catch {
      /* private mode — session-only confirmation */
    }
    onConfirm();
  }
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight">
          Adult content ahead
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This section surfaces hentai manga, manhwa, and manhua (18+). By
          continuing you confirm that you are at least 18 years old and want to
          view mature content.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={confirm} className="w-full">
            I am 18 or older — continue
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/manga")}
          >
            Take me back
          </Button>
        </div>
      </div>
    </main>
  );
}

function AdultMangaBrowser() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<FormatTab>("all");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 400);

  const [results, setResults] = useState<JikanManga[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<Status>("loading");
  const [degraded, setDegraded] = useState(false);
  const [source, setSource] = useState<string>("mal");

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
    searchAdultMangaAction(
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
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-gradient text-2xl font-semibold tracking-tight">
          Miscellaneous
        </h1>
        <Badge variant="outline" className="border-destructive/50 text-destructive">
          18+
        </Badge>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Hentai manga, manhwa, and manhua. Your manga library is only ever
        visible to you.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search titles…"
          aria-label="Search adult manga"
          className="h-10 max-w-sm"
        />
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
          Something went wrong. Please try again.
        </p>
      ) : null}

      {status === "success" && results.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          No titles found.
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

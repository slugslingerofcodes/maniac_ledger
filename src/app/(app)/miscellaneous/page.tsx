"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Pagination } from "@/components/anime/Pagination";
import { SourceNotice } from "@/components/SourceNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addToLibraryAction, getUserLibrary } from "@/app/actions/library";
import { LIBRARY_QUERY_KEY } from "@/app/(app)/library/library-grid-client";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import type { JikanAnime } from "@/lib/jikan";

const AGE_GATE_KEY = "misc_age_ok_v1";

type Mode = "both" | "ecchi" | "hentai";
type Status = "idle" | "loading" | "success" | "error";

const MODES: { value: Mode; label: string }[] = [
  { value: "both", label: "All" },
  { value: "ecchi", label: "Ecchi" },
  { value: "hentai", label: "Hentai" },
];

function posterOf(a: JikanAnime): string | null {
  return a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url ?? null;
}

export default function MiscellaneousPage() {
  // null = unknown (pre-hydration), false = must confirm, true = confirmed.
  const [ageOk, setAgeOk] = useState<boolean | null>(null);

  // Read the one-time 18+ confirmation from localStorage on mount. Reading a
  // persisted flag into state is a legitimate effect (same pattern as
  // ShareBanner); the set-state-in-effect rule is a false positive here.
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
  return <MiscBrowser />;
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
          This section surfaces ecchi and hentai (18+) titles from MyAnimeList.
          By continuing you confirm that you are at least 18 years old and want
          to view mature content.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={confirm} className="w-full">
            I am 18 or older — continue
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/")}
          >
            Take me back
          </Button>
        </div>
      </div>
    </main>
  );
}

function MiscBrowser() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("both");
  const [page, setPage] = useState(1);
  const [titleLang] = useTitleLanguage();
  const debouncedQuery = useDebounce(query, 400);

  const [results, setResults] = useState<JikanAnime[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [pageInfo, setPageInfo] = useState<{ totalPages: number } | null>(null);
  // Which engine served the results ("mal" | "anilist" | "catalog") + whether
  // we're on the local-catalog fallback.
  const [source, setSource] = useState<string>("mal");
  const [degraded, setDegraded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Highlight titles already in the library ("Added ✓").
  const { data: library } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => getUserLibrary(),
    staleTime: 5 * 60_000,
  });
  const libraryMalIds = new Set(
    (library ?? [])
      .map((i) => i.malId)
      .filter((id): id is number => id != null),
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    const params = new URLSearchParams({ mode, page: String(page) });
    const q = debouncedQuery.trim();
    if (q.length >= 1) params.set("q", q);

    fetch(`/api/anime/misc-search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Search request failed");
        const body = await res.json();
        const seen = new Set<number>();
        const unique = ((body.results ?? []) as JikanAnime[]).filter((a) => {
          if (seen.has(a.mal_id)) return false;
          seen.add(a.mal_id);
          return true;
        });
        setResults(unique);
        setPageInfo({ totalPages: body.totalPages ?? 1 });
        setSource(body.source ?? "mal");
        setDegraded(Boolean(body.degraded));
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [debouncedQuery, mode, page]);
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
        Ecchi and hentai titles from MyAnimeList. Adds go to your library but
        stay completely private — never shown on the feed, your public profile,
        or to friends.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search ecchi / hentai…"
          aria-label="Search adult titles"
          className="h-10 max-w-sm"
        />
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => {
                setMode(m.value);
                setPage(1);
              }}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors",
                mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" ? <SkeletonGrid /> : null}

      {status === "success" ? (
        <SourceNotice source={source} degraded={degraded} />
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
            {results.map((anime) => (
              <PosterCard
                key={anime.mal_id}
                anime={anime}
                titleLang={titleLang}
                alreadyInLibrary={libraryMalIds.has(anime.mal_id)}
              />
            ))}
          </div>
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

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
      ))}
    </div>
  );
}

function PosterCard({
  anime,
  titleLang,
  alreadyInLibrary,
}: {
  anime: JikanAnime;
  titleLang: ReturnType<typeof useTitleLanguage>[0];
  alreadyInLibrary: boolean;
}) {
  const poster = posterOf(anime);
  const title = displayTitle(titleLang, anime.title, anime.title_english);

  return (
    <div className="group relative isolate flex flex-col gap-2">
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
        {anime.score != null ? (
          <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
            ★ {anime.score}
          </Badge>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/60 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
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
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const added = alreadyInLibrary || justAdded;

  function onAdd() {
    if (!online) {
      toast.error("Connect to internet to add.");
      return;
    }
    setJustAdded(true);
    startTransition(async () => {
      // Private: entries from this tab never reach the feed, public profiles,
      // or friends (RLS, migration 0023).
      const res = await addToLibraryAction(anime, { isPrivate: true });
      if (!res.ok) {
        setJustAdded(false);
        toast.error(res.error);
      } else {
        queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
        track("anime_added", {
          malId: anime.mal_id,
          title: anime.title,
          source: "miscellaneous",
        });
      }
    });
  }

  return (
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
  );
}

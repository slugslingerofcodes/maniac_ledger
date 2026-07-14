"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { fetchAnimeArts, fetchFanArts } from "@/app/actions/arts";
import { PosterLightbox } from "@/components/PosterLightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import {
  ART_CATEGORIES,
  type ArtCategory,
  type ArtPiece,
  type FanArt,
} from "@/lib/arts";
import { cn } from "@/lib/utils";

type Mode = "fanart" | "random";
type Status = "loading" | "success" | "error";

const CATEGORY_LABEL: Record<ArtCategory, string> = {
  neko: "Neko",
  waifu: "Waifu",
  kitsune: "Kitsune",
  husbando: "Husbando",
};

/**
 * Anime art gallery, two sources:
 *  - Fan Art (Safebooru, all safe-rated): trending art of famous series, with
 *    a search box that filters by the character in the art (tag-resolved).
 *  - Random (nekos.best): random SFW art by category with artist credits.
 * Every image zooms in the shared poster lightbox.
 */
export default function AnimeArtsPage() {
  const [mode, setMode] = useState<Mode>("fanart");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-1 text-2xl font-semibold tracking-tight">
        Anime Arts
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Fan art of the shows you love — search by character, or roll random
        picks. Tap any piece to view it full size.
      </p>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {(
          [
            { value: "fanart", label: "Fan Art" },
            { value: "random", label: "Random picks" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={mode === tab.value}
            onClick={() => setMode(tab.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              mode === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "fanart" ? <FanArtSection /> : <RandomSection />}
    </main>
  );
}

/* ----------------------------- Fan art mode ------------------------------- */

function FanArtSection() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 450);

  const [arts, setArts] = useState<FanArt[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [pending, startTransition] = useTransition();

  // New query → fresh grid; further pages append (deduped by post id).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    if (page === 1) setStatus("loading");
    fetchFanArts(debouncedQuery, page)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTag(res.tag);
          setArts((prev) => {
            const next = page === 1 ? res.arts : [...prev, ...res.arts];
            const seen = new Set<number>();
            return next.filter((a) =>
              seen.has(a.id) ? false : (seen.add(a.id), true),
            );
          });
          setStatus("success");
        } else if (page === 1) {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled && page === 1) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <section>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder="Search by character… (e.g. nezuko, gojo satoru, mikasa)"
        aria-label="Search fan art by character"
        className="mb-2 h-10 max-w-md"
      />
      {tag && status === "success" ? (
        <p className="mb-4 text-xs text-muted-foreground">
          Showing art tagged{" "}
          <span className="font-mono text-foreground">{tag}</span>
          {arts.length === 0 ? " — nothing found, try another name." : ""}
        </p>
      ) : (
        <p className="mb-4 text-xs text-muted-foreground">
          {status === "success" && !tag
            ? "Trending fan art across famous series."
            : " "}
        </p>
      )}

      {status === "loading" ? <ArtSkeletonGrid /> : null}

      {status === "error" ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Fan art is unavailable right now. Please try again.
        </p>
      ) : null}

      {status === "success" && arts.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          No art found for that character.
        </p>
      ) : null}

      {status === "success" && arts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {arts.map((art) => (
              <figure key={art.id} className="group flex flex-col gap-1.5">
                <PosterLightbox src={art.fullUrl} alt="Anime fan art">
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:ring-2 group-hover:ring-primary/40">
                    <Image
                      src={art.url}
                      alt="Anime fan art"
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                </PosterLightbox>
                <figcaption className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
                  <span>{art.score != null ? `♥ ${art.score}` : " "}</span>
                  <a
                    href={art.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View post and credits on Safebooru"
                    className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
                  >
                    credits <ExternalLink className="size-3" aria-hidden />
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(() => setPage((p) => p + 1))}
            >
              <RefreshCw
                className={cn("mr-2 size-4", pending ? "animate-spin" : "")}
                aria-hidden
              />
              Load more
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------ Random mode ------------------------------- */

function RandomSection() {
  const [category, setCategory] = useState<ArtCategory>("waifu");
  const [arts, setArts] = useState<ArtPiece[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [pending, startTransition] = useTransition();

  function load(cat: ArtCategory, append: boolean) {
    startTransition(async () => {
      const res = await fetchAnimeArts(cat, 12);
      if (res.ok) {
        setArts((prev) => {
          const next = append ? [...prev, ...res.arts] : res.arts;
          const seen = new Set<string>();
          return next.filter((a) =>
            seen.has(a.url) ? false : (seen.add(a.url), true),
          );
        });
        setStatus("success");
      } else if (!append) {
        setStatus("error");
      }
    });
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStatus("loading");
    setArts([]);
    load(category, false);
  }, [category]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <section>
      <div className="mb-6 flex flex-wrap gap-1.5">
        {ART_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              category === c
                ? "bg-primary/80 text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {status === "loading" ? <ArtSkeletonGrid /> : null}

      {status === "error" ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          The art gallery is unavailable right now. Please try again.
        </p>
      ) : null}

      {status === "success" ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {arts.map((art) => (
              <figure key={art.url} className="group flex flex-col gap-1.5">
                <PosterLightbox src={art.url} alt={art.artistName ?? "Anime art"}>
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10 group-hover:ring-2 group-hover:ring-primary/40">
                    <Image
                      src={art.url}
                      alt={art.artistName ?? "Anime art"}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                </PosterLightbox>
                <figcaption className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
                  {art.artistHref ? (
                    <a
                      href={art.artistHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:text-foreground hover:underline"
                    >
                      {art.artistName ?? "Artist"}
                    </a>
                  ) : (
                    <span className="truncate">
                      {art.artistName ?? "Unknown artist"}
                    </span>
                  )}
                  {art.sourceUrl ? (
                    <a
                      href={art.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View source"
                      className="shrink-0 hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => load(category, true)}
            >
              <RefreshCw
                className={cn("mr-2 size-4", pending ? "animate-spin" : "")}
                aria-hidden
              />
              {pending ? "Loading…" : "Load more"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ArtSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
      ))}
    </div>
  );
}

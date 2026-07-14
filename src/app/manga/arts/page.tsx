"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { fetchAnimeArts } from "@/app/actions/arts";
import { PosterLightbox } from "@/components/PosterLightbox";
import {
  ART_CATEGORIES,
  type ArtCategory,
  type ArtPiece,
} from "@/lib/arts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<ArtCategory, string> = {
  neko: "Neko",
  waifu: "Waifu",
  kitsune: "Kitsune",
  husbando: "Husbando",
};

/**
 * Anime art gallery (nekos.best): random SFW artwork by category, with artist
 * credits and source links. "Load more" appends a fresh batch; every image
 * zooms in the shared poster lightbox.
 */
export default function AnimeArtsPage() {
  const [category, setCategory] = useState<ArtCategory>("waifu");
  const [arts, setArts] = useState<ArtPiece[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [pending, startTransition] = useTransition();

  function load(cat: ArtCategory, append: boolean) {
    startTransition(async () => {
      const res = await fetchAnimeArts(cat, 12);
      if (res.ok) {
        setArts((prev) => {
          const next = append ? [...prev, ...res.arts] : res.arts;
          // Dedupe by image URL (random batches can repeat).
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient mb-1 text-2xl font-semibold tracking-tight">
        Anime Arts
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        A rotating gallery of anime artwork — tap a piece to view it full size.
        Credits link to the original artists.
      </p>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {ART_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              category === c
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
          ))}
        </div>
      ) : null}

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
                    <span className="truncate">{art.artistName ?? "Unknown artist"}</span>
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
    </main>
  );
}

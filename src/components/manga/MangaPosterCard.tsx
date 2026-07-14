"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { addMangaToLibraryAction } from "@/app/actions/manga";
import { MANGA_LIBRARY_QUERY_KEY } from "@/components/manga/MangaLibraryGridClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JikanManga } from "@/lib/jikan";

function coverOf(m: JikanManga): string | null {
  return m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null;
}

/** A manga poster with title overlay + an add-to-library button. */
export function MangaPosterCard({
  manga,
  alreadyInLibrary = false,
}: {
  manga: JikanManga;
  alreadyInLibrary?: boolean;
}) {
  const cover = coverOf(manga);
  const title = manga.title_english ?? manga.title;
  // MAL-linked titles use the MAL-keyed detail page; MangaDex-only titles
  // (no MAL entry) open on the md route.
  const href =
    manga.mal_id != null
      ? `/manga/${manga.mal_id}`
      : `/manga/md/${manga.mangadex_id}`;

  return (
    <div className="group relative isolate flex flex-col gap-2">
      <Link
        href={href}
        aria-label={`View details for ${title}`}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40"
      >
        {cover ? (
          <Image
            src={cover}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No cover
          </div>
        )}
        {manga.score != null ? (
          <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
            ★ {manga.score}
          </Badge>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/60 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
        </div>
      </Link>
      <MangaAddButton manga={manga} alreadyInLibrary={alreadyInLibrary} />
    </div>
  );
}

function MangaAddButton({
  manga,
  alreadyInLibrary,
}: {
  manga: JikanManga;
  alreadyInLibrary: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const queryClient = useQueryClient();
  const added = alreadyInLibrary || justAdded;

  function onAdd() {
    setJustAdded(true);
    startTransition(async () => {
      const res = await addMangaToLibraryAction(manga);
      if (!res.ok) {
        setJustAdded(false);
        toast.error(res.error);
      } else {
        queryClient.invalidateQueries({ queryKey: MANGA_LIBRARY_QUERY_KEY });
      }
    });
  }

  return (
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
  );
}

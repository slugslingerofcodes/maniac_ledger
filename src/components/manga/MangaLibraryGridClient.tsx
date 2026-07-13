"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  getUserMangaLibrary,
  removeFromMangaLibraryAction,
  type MangaEntryItem,
} from "@/app/actions/manga";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { READING_STATUS_META, type ReadingStatus } from "@/types/manga";

export const MANGA_LIBRARY_QUERY_KEY = ["user-manga-library"] as const;

const FIVE_MIN_MS = 5 * 60_000;

/** Format filter: MAL media-kind display strings, or "all". */
export type MangaFormatFilter = "all" | "Manga" | "Manhwa" | "Manhua";

/**
 * Client-side manga library grid backed by TanStack Query — the manga analog of
 * the anime `LibraryGridClient`. Status and format filtering are done
 * client-side off the cached list. `limit` caps the rendered count (used on
 * the manga home).
 */
export function MangaLibraryGridClient({
  filter = "all",
  format = "all",
  limit,
}: {
  filter?: "all" | ReadingStatus;
  format?: MangaFormatFilter;
  limit?: number;
}) {
  const queryClient = useQueryClient();
  const [, startRemove] = useTransition();

  const { data, isPending, isError } = useQuery({
    queryKey: MANGA_LIBRARY_QUERY_KEY,
    queryFn: () => getUserMangaLibrary(),
    staleTime: FIVE_MIN_MS,
  });

  function removeItem(id: string, title: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove “${title}” from your manga library?`)
    ) {
      return;
    }
    const prev = queryClient.getQueryData<MangaEntryItem[]>(
      MANGA_LIBRARY_QUERY_KEY,
    );
    queryClient.setQueryData<MangaEntryItem[]>(MANGA_LIBRARY_QUERY_KEY, (old) =>
      (old ?? []).filter((i) => i.id !== id),
    );
    startRemove(async () => {
      const res = await removeFromMangaLibraryAction(id);
      if (res.ok) {
        toast.success(`Removed “${title}”.`);
      } else {
        if (prev) queryClient.setQueryData(MANGA_LIBRARY_QUERY_KEY, prev);
        else
          queryClient.invalidateQueries({ queryKey: MANGA_LIBRARY_QUERY_KEY });
        toast.error(res.error);
      }
    });
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your manga library. Please try again.
      </p>
    );
  }

  let items = (data ?? []).filter(
    (i) =>
      (filter === "all" || i.status === filter) &&
      (format === "all" || i.type === format),
  );
  if (limit != null) items = items.slice(0, limit);

  if (items.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-transparent">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            No manga here yet — search and add something to start tracking.
          </p>
          <Link
            href="/manga/search"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Search manga
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.id} className="group/lib relative">
          <MangaCard item={item} />
          <button
            type="button"
            onClick={() => removeItem(item.id, item.title)}
            aria-label={`Remove ${item.title} from library`}
            title="Remove from library"
            className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur transition hover:bg-destructive hover:text-white focus-visible:opacity-100 md:opacity-0 md:group-hover/lib:opacity-100"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function MangaCard({ item }: { item: MangaEntryItem }) {
  const meta = READING_STATUS_META[item.status];
  const hasTotal = item.totalChapters != null && item.totalChapters > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((item.chaptersRead / item.totalChapters!) * 100))
    : 0;
  const href = item.malId != null ? `/manga/${item.malId}` : "/manga";

  return (
    <Link href={href} className="group block">
      <Card className="gap-0 overflow-hidden py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt={item.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No cover
            </div>
          )}
          <Badge className={cn("absolute left-2 top-2 border", meta.className)}>
            {meta.label}
          </Badge>
        </div>
        <CardContent className="flex flex-col gap-2 p-3">
          <h3
            className="line-clamp-2 text-sm font-medium leading-snug"
            title={item.title}
          >
            {item.title}
          </h3>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Chapters</span>
            <span>
              {item.chaptersRead}
              {hasTotal ? ` / ${item.totalChapters}` : ""}
            </span>
          </div>
          {hasTotal ? <Progress value={percent} className="h-1.5" /> : null}
          {item.type ? (
            <div className="flex justify-end">
              <Badge variant="outline" className="uppercase tracking-wide">
                {item.type}
              </Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

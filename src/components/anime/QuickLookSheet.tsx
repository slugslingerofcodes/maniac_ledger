"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Star } from "lucide-react";
import { toast } from "sonner";

import { upsertProgress } from "@/app/actions/progress";
import { AdvanceEpisodeButton } from "@/components/anime/AdvanceEpisodeButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { posterUrl } from "@/lib/poster";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

export type QuickLookItem = {
  id: string;
  title: string;
  posterUrl: string | null;
  status: WatchStatus;
  episodesWatched: number;
  totalEpisodes: number | null;
  score: number | null;
  genres?: string[];
};

const STATUSES = Object.keys(WATCH_STATUS_META) as WatchStatus[];

/**
 * A peek at one entry without leaving the grid.
 *
 * `/anime/[id]` is a 745-line page that hits Jikan and lazily backfills the
 * episode catalog — a heavy price for the two things people most often want:
 * change the status, set a score. This sheet does both against data the grid
 * already holds, which also means it works from the IndexedDB-persisted
 * library while offline, where the detail page cannot.
 *
 * Deliberately *not* a synopsis viewer: fetching one would reintroduce the
 * network dependency this exists to avoid. "Open full page" is one tap away
 * for anything deeper.
 */
export function QuickLookSheet({
  item,
  open,
  onOpenChange,
}: {
  item: QuickLookItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  // Local echo so the controls respond instantly; the query refetch confirms.
  const [status, setStatus] = useState<WatchStatus | null>(null);
  const [score, setScore] = useState<number | null | undefined>(undefined);

  if (!item) return null;

  const shownStatus = status ?? item.status;
  const shownScore = score === undefined ? item.score : score;
  const hasTotal = item.totalEpisodes != null && item.totalEpisodes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((item.episodesWatched / item.totalEpisodes!) * 100))
    : 0;

  function patch(
    next: { status?: WatchStatus; score?: number | null },
    revert: () => void,
  ) {
    startTransition(async () => {
      const res = await upsertProgress(item!.id, next);
      if (!res.ok) {
        revert();
        toast.error(res.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["user-library"] });
    });
  }

  function changeStatus(next: WatchStatus) {
    const previous = shownStatus;
    setStatus(next);
    patch({ status: next }, () => setStatus(previous));
  }

  function changeScore(next: number | null) {
    const previous = shownScore;
    setScore(next);
    patch({ score: next }, () => setScore(previous));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          // Drop the local echo so reopening a different card starts clean.
          setStatus(null);
          setScore(undefined);
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] gap-4 overflow-y-auto rounded-t-2xl sm:max-w-lg"
      >
        <div className="flex gap-4">
          <span className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
            {item.posterUrl ? (
              <Image
                src={posterUrl(item.posterUrl, "card")!}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="line-clamp-2 text-lg">
              {item.title}
            </SheetTitle>
            <SheetDescription className="mt-1">
              {hasTotal
                ? `${item.episodesWatched} of ${item.totalEpisodes} episodes`
                : `${item.episodesWatched} episodes watched`}
            </SheetDescription>
            {hasTotal ? <Progress value={percent} className="mt-2 h-1.5" /> : null}
            {item.genres && item.genres.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.genres.slice(0, 3).map((g) => (
                  <Badge key={g} variant="outline" className="text-[10px]">
                    {g}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AdvanceEpisodeButton
            animeId={item.id}
            title={item.title}
            episodesWatched={item.episodesWatched}
            totalEpisodes={item.totalEpisodes}
            status={shownStatus}
            variant="full"
            source="quick-look"
          />
          <Link
            href={`/anime/${item.id}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "ml-auto gap-1.5",
            )}
          >
            Open full page
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>

        <fieldset disabled={pending} className="contents">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  aria-pressed={shownStatus === s}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    shownStatus === s
                      ? WATCH_STATUS_META[s].className
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {WATCH_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your score
            </p>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeScore(shownScore === n ? null : n)}
                  aria-pressed={shownScore === n}
                  aria-label={`Rate ${n} out of 10`}
                  className={cn(
                    "grid size-8 place-items-center rounded-md border text-xs font-semibold tabular-nums transition",
                    shownScore != null && n <= shownScore
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
              {shownScore != null ? (
                <button
                  type="button"
                  onClick={() => changeScore(null)}
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <Star className="size-3" aria-hidden />
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}

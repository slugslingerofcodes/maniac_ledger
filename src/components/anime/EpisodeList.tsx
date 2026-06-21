"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { toggleEpisode } from "@/app/actions/progress";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types/anime";

type Props = {
  episodes: Episode[];
  initialWatchedIds: string[];
  // Part of the public prop contract; the toggle action resolves the anime from
  // the episode itself, so it isn't needed for the DB call.
  animeId: string;
};

export function EpisodeList({ episodes, initialWatchedIds }: Props) {
  // Confirmed server state. Seeded once from props; updated when an action
  // succeeds. (Note: the episodes table has no runtime column, so runtime is
  // not rendered — only number / title / air date are available.)
  const [watched, setWatched] = useState<Set<string>>(
    () => new Set(initialWatchedIds),
  );

  // Optimistic layer over `watched`: toggling an id flips its membership.
  const [optimisticWatched, applyOptimistic] = useOptimistic(
    watched,
    (current: Set<string>, episodeId: string) => {
      const next = new Set(current);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    },
  );

  const [isPending, startTransition] = useTransition();

  function onToggle(episodeId: string) {
    const willWatch = !watched.has(episodeId);

    startTransition(async () => {
      // Instant UI flip; auto-reverts to `watched` if the transition ends
      // without us committing the change below.
      applyOptimistic(episodeId);

      const res = await toggleEpisode(episodeId, willWatch);
      if (res.ok) {
        setWatched((prev) => {
          const next = new Set(prev);
          if (willWatch) next.add(episodeId);
          else next.delete(episodeId);
          return next;
        });
      } else {
        toast.error(res.error);
      }
    });
  }

  const watchedCount = optimisticWatched.size;
  const total = episodes.length;

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5 text-sm">
        <span className="font-medium">Episodes</span>
        <span className="tabular-nums text-muted-foreground">
          {watchedCount} / {total} watched
        </span>
      </div>

      <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
        {episodes.map((ep) => {
          const isWatched = optimisticWatched.has(ep.id);
          const checkboxId = `ep-${ep.id}`;
          return (
            <li
              key={ep.id}
              className="flex items-center gap-3 bg-card px-4 py-2.5 text-sm"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={isWatched}
                disabled={isPending}
                onChange={() => onToggle(ep.id)}
                className="size-4 shrink-0 accent-primary disabled:opacity-60"
              />
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                {ep.number}
              </span>
              <label
                htmlFor={checkboxId}
                className={cn(
                  "flex-1 cursor-pointer truncate",
                  isWatched && "text-muted-foreground line-through",
                )}
              >
                {ep.title ?? `Episode ${ep.number}`}
              </label>
              {ep.aired_date ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(ep.aired_date).toLocaleDateString()}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

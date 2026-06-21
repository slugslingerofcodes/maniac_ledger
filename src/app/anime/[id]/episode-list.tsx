"use client";

import { useState, useTransition } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { toggleEpisodeWatched } from "./actions";

export type EpisodeRow = {
  id: string;
  number: number;
  title: string | null;
  aired_date: string | null;
};

export function EpisodeList({
  animeId,
  episodes,
  initialWatchedIds,
}: {
  animeId: string;
  episodes: EpisodeRow[];
  initialWatchedIds: string[];
}) {
  const [watched, setWatched] = useState<Set<string>>(
    () => new Set(initialWatchedIds),
  );
  const [pending, startTransition] = useTransition();

  function toggle(episodeId: string) {
    const wasWatched = watched.has(episodeId);

    // Optimistic update.
    setWatched((prev) => {
      const next = new Set(prev);
      if (wasWatched) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });

    startTransition(async () => {
      const res = await toggleEpisodeWatched(episodeId, animeId, !wasWatched);
      if (!res.ok) {
        // Revert on failure.
        setWatched((prev) => {
          const next = new Set(prev);
          if (wasWatched) next.add(episodeId);
          else next.delete(episodeId);
          return next;
        });
      }
    });
  }

  const watchedCount = watched.size;
  const total = episodes.length;
  const percent = total > 0 ? Math.round((watchedCount / total) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Progress value={percent} className="h-1.5" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {watchedCount} / {total}
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {episodes.map((ep) => {
          const isWatched = watched.has(ep.id);
          return (
            <li
              key={ep.id}
              className="flex items-center gap-3 bg-card px-4 py-2.5 text-sm"
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isWatched}
                aria-label={`Mark episode ${ep.number} ${
                  isWatched ? "unwatched" : "watched"
                }`}
                disabled={pending}
                onClick={() => toggle(ep.id)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded border text-xs transition-colors disabled:opacity-60",
                  isWatched
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-border text-transparent hover:border-foreground/30",
                )}
              >
                ✓
              </button>
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                {ep.number}
              </span>
              <span
                className={cn(
                  "flex-1 truncate",
                  isWatched && "text-muted-foreground",
                )}
              >
                {ep.title ?? `Episode ${ep.number}`}
              </span>
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

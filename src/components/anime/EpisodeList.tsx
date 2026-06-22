"use client";

import { useOptimistic, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
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

  function commitToggle(episodeId: string, target: boolean) {
    startTransition(async () => {
      // Instant UI flip; auto-reverts to `watched` if the transition ends
      // without us committing the change below.
      applyOptimistic(episodeId);

      const res = await toggleEpisode(episodeId, target);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setWatched((prev) => {
        const next = new Set(prev);
        if (target) next.add(episodeId);
        else next.delete(episodeId);
        return next;
      });

      // Un-marking is the destructive direction — offer a one-tap undo.
      if (!target) {
        toast("Episode unmarked", {
          action: {
            label: "Undo",
            onClick: () => commitToggle(episodeId, true),
          },
        });
      }
    });
  }

  function onToggle(episodeId: string) {
    commitToggle(episodeId, !watched.has(episodeId));
  }

  const watchedCount = optimisticWatched.size;
  const total = episodes.length;
  // Lowest-numbered episode not yet watched — the swipe-to-mark target.
  const nextUnwatched = episodes.find((e) => !optimisticWatched.has(e.id));

  return (
    <div>
      {nextUnwatched ? (
        <NextEpisodeSwipeCard
          key={nextUnwatched.id}
          episode={nextUnwatched}
          onMark={() => commitToggle(nextUnwatched.id, true)}
        />
      ) : null}

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
              id={`ep-${ep.number}`}
              className="flex scroll-mt-24 items-center gap-3 bg-card px-4 py-2.5 text-sm"
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
    </div>
  );
}

/**
 * Swipeable "next episode" card. Drag it right past the threshold and release to
 * mark the episode watched — the card slides off to reveal a green check, then
 * `onMark` fires. Works with touch and mouse (framer-motion drag).
 */
function NextEpisodeSwipeCard({
  episode,
  onMark,
}: {
  episode: Episode;
  onMark: () => void;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-3 overflow-hidden rounded-xl ring-1 ring-foreground/10"
    >
      {/* Revealed behind the card as it slides away. */}
      <div className="absolute inset-0 flex items-center gap-2 bg-emerald-500/20 px-4 text-sm font-medium text-emerald-300">
        <Check className="size-5" />
        Marked watched
      </div>

      <motion.div
        drag={armed ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.x > 120) setArmed(true);
        }}
        animate={armed ? { x: "100%" } : { x: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        onAnimationComplete={() => {
          if (armed) onMark();
        }}
        className="relative flex cursor-grab touch-pan-y items-center gap-3 bg-card px-4 py-3.5 active:cursor-grabbing"
      >
        <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Next
        </span>
        <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
          {episode.number}
        </span>
        <span className="flex-1 truncate text-sm font-medium">
          {episode.title ?? `Episode ${episode.number}`}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
          swipe →
        </span>
      </motion.div>
    </motion.div>
  );
}

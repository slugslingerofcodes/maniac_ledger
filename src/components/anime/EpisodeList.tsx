"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";
import { toast } from "sonner";

import {
  getEpisodeRatings,
  markEpisodesUpTo,
  rateEpisode,
  toggleEpisode,
} from "@/app/actions/progress";
import { track } from "@/lib/analytics";
import { celebrateCompletion } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types/anime";

type Props = {
  episodes: Episode[];
  initialWatchedIds: string[];
  // The toggle action resolves the anime from the episode, so this isn't needed
  // for the DB call — only for the analytics event.
  animeId: string;
};

export function EpisodeList({ episodes, initialWatchedIds, animeId }: Props) {
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

  // The most recent cascade fill: episode id → its position in the cascade,
  // plus a stamp so replaying the same cascade re-runs the flash. Drives a
  // staggered row highlight so back-filling 1–6 is visible, not instant.
  const [cascade, setCascade] = useState<{
    order: Map<string, number>;
    stamp: number;
  } | null>(null);

  // Per-episode 1–5 star ratings (migration 0017). null → feature unavailable
  // (column missing), so the star row is hidden entirely.
  const [ratings, setRatings] = useState<Record<string, number> | null>(null);
  const [ratingsReady, setRatingsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getEpisodeRatings(animeId).then((r) => {
      if (cancelled) return;
      setRatings(r);
      setRatingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  function commitRating(episodeId: string, value: number) {
    const prev = ratings ?? {};
    // Clicking the current rating clears it.
    const clearing = prev[episodeId] === value;
    const nextRatings = { ...prev };
    if (clearing) delete nextRatings[episodeId];
    else nextRatings[episodeId] = value;
    setRatings(nextRatings); // optimistic

    void rateEpisode(episodeId, clearing ? null : value).then((res) => {
      if (!res.ok) {
        setRatings(prev); // revert
        toast.error(res.error);
      }
    });
  }

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

      // Compute completion off the confirmed set (not the optimistic layer) so
      // a failed action can never celebrate.
      let completedAll = false;
      setWatched((prev) => {
        const next = new Set(prev);
        if (target) next.add(episodeId);
        else next.delete(episodeId);
        completedAll =
          target && episodes.length > 0 && next.size === episodes.length;
        return next;
      });
      if (completedAll) void celebrateCompletion();

      if (target) {
        track("episode_marked_watched", { animeId, episodeId });
      } else {
        // Un-marking is the destructive direction — offer a one-tap undo.
        toast("Episode unmarked", {
          action: {
            label: "Undo",
            onClick: () => commitToggle(episodeId, true),
          },
        });
      }
    });
  }

  /**
   * Marking an episode watched cascades to every earlier episode (you can't
   * have seen ep 7 without 1–6). Optimistically flips all not-yet-watched
   * episodes up to the target, then persists them in one server call.
   */
  function commitMarkThrough(target: Episode) {
    startTransition(async () => {
      const toAdd = episodes.filter(
        (e) => e.number <= target.number && !watched.has(e.id),
      );
      if (toAdd.length === 0) return;
      // Show the fill sweeping down the list (earliest episode first).
      setCascade({
        order: new Map(toAdd.map((e, i) => [e.id, i])),
        stamp: Date.now(),
      });
      for (const e of toAdd) applyOptimistic(e.id);

      const res = await markEpisodesUpTo(target.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      let completedAll = false;
      setWatched((prev) => {
        const next = new Set(prev);
        for (const e of episodes) if (e.number <= target.number) next.add(e.id);
        completedAll = episodes.length > 0 && next.size === episodes.length;
        return next;
      });
      if (completedAll) void celebrateCompletion();
      track("episode_marked_watched", { animeId, episodeId: target.id });
    });
  }

  function onToggle(ep: Episode) {
    // Checking cascades backward; unchecking only clears that one episode.
    if (watched.has(ep.id)) commitToggle(ep.id, false);
    else commitMarkThrough(ep);
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
          onMark={() => commitMarkThrough(nextUnwatched)}
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
          const cascadeIndex = cascade?.order.get(ep.id);
          return (
            <li
              key={ep.id}
              id={`ep-${ep.number}`}
              className="relative flex scroll-mt-24 items-center gap-3 bg-card px-4 py-2.5 text-sm"
            >
              {cascadeIndex != null ? (
                // Keyed on the stamp so a repeat cascade replays the sweep.
                <span
                  key={cascade!.stamp}
                  aria-hidden
                  className="cascade-flash pointer-events-none absolute inset-0"
                  style={{ animationDelay: `${cascadeIndex * 45}ms` }}
                />
              ) : null}
              <input
                id={checkboxId}
                type="checkbox"
                checked={isWatched}
                disabled={isPending}
                onChange={() => onToggle(ep)}
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
              {isWatched && ratingsReady && ratings != null ? (
                <span
                  className="hidden shrink-0 items-center gap-0.5 sm:flex"
                  role="radiogroup"
                  aria-label={`Rate episode ${ep.number}`}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = (ratings[ep.id] ?? 0) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={ratings[ep.id] === n}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onClick={() => commitRating(ep.id, n)}
                        className="text-muted-foreground/40 transition-colors hover:text-amber-300"
                      >
                        <Star
                          className={cn(
                            "size-3",
                            filled && "fill-amber-400 text-amber-400",
                          )}
                        />
                      </button>
                    );
                  })}
                </span>
              ) : null}
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
        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
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

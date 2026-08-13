"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { advanceEpisode, rewindEpisode } from "@/app/actions/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

/**
 * "I watched the next one" — the app's core action, wherever a title is already
 * on screen. Before this, marking an episode cost a navigation to
 * `/anime/[id]` plus a Jikan round trip and an episode-catalog backfill; the
 * rail and the grid both showed progress but offered no way to change it.
 *
 * Renders as a sibling of the card's link (never nested inside it — an
 * interactive control inside an anchor is both invalid and unclickable on
 * touch), so every caller places it in a `relative` wrapper.
 *
 * The optimistic bit is purely local: the button flips to a tick and the count
 * moves immediately, the server action follows, and a failure rolls the label
 * back and surfaces the error. The undo toast calls `rewindEpisode`, the exact
 * inverse, so the per-episode checklist can't drift from the counter.
 */
export function AdvanceEpisodeButton({
  animeId,
  title,
  episodesWatched,
  totalEpisodes,
  status,
  className,
  variant = "icon",
  source,
}: {
  animeId: string;
  title: string;
  episodesWatched: number;
  totalEpisodes: number | null;
  status: WatchStatus;
  className?: string;
  /** `icon` for card overlays, `full` for the wider rail cards. */
  variant?: "icon" | "full";
  /** Which surface this button was pressed from (analytics only). */
  source: "rail" | "grid" | "quick-look";
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  // Local echo of the counter so the label updates before the refresh lands.
  const [watched, setWatched] = useState(episodesWatched);
  const [justAdvanced, setJustAdvanced] = useState(false);

  const hasTotal = totalEpisodes != null && totalEpisodes > 0;
  const finished = hasTotal && watched >= totalEpisodes;
  const next = watched + 1;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["user-library"] });
    router.refresh();
  }

  function onClick(e: React.MouseEvent) {
    // The card link sits underneath; marking an episode must not navigate.
    e.preventDefault();
    e.stopPropagation();
    if (pending || finished) return;

    const previousStatus: WatchStatus = status;
    setWatched(next);
    setJustAdvanced(true);

    startTransition(async () => {
      const res = await advanceEpisode(animeId);
      if (!res.ok) {
        setWatched((n) => n - 1);
        setJustAdvanced(false);
        toast.error(res.error);
        return;
      }

      track("episode_advanced", { animeId, source });
      toast.success(
        res.completed
          ? `Finished “${title}” — nice.`
          : `Episode ${res.episode} of “${title}” marked watched.`,
        {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              setWatched((n) => Math.max(0, n - 1));
              setJustAdvanced(false);
              void rewindEpisode(animeId, previousStatus).then((undone) => {
                if (!undone.ok) toast.error(undone.error);
                refresh();
              });
            },
          },
        },
      );
      refresh();
      // Let the tick settle, then return to the "+" affordance.
      setTimeout(() => setJustAdvanced(false), 1600);
    });
  }

  if (finished) return null;

  const label = `Mark episode ${next}${hasTotal ? ` of ${totalEpisodes}` : ""} of ${title} watched`;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg transition hover:brightness-110 disabled:opacity-70",
          className,
        )}
      >
        {justAdvanced ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
        {justAdvanced ? "Marked" : `Ep ${next}`}
      </button>
    );
  }

  return (
    <Tooltip label={`Mark episode ${next} watched`}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={label}
        className={cn(
          "grid size-8 place-items-center rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur transition hover:bg-primary hover:text-primary-foreground disabled:opacity-70",
          className,
        )}
      >
        {justAdvanced ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
      </button>
    </Tooltip>
  );
}

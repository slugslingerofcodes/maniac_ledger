"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  upsertProgress,
  type ProgressPatch,
} from "@/app/actions/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { UserProgress, WatchStatus } from "@/types/anime";

const STATUSES = Object.keys(WATCH_STATUS_META) as WatchStatus[];
const NOTES_DEBOUNCE_MS = 800;

type Props = {
  animeId: string;
  totalEpisodes: number | null;
  initialProgress: UserProgress | null;
};

export function ProgressSidebar({
  animeId,
  totalEpisodes,
  initialProgress,
}: Props) {
  const [inLibrary, setInLibrary] = useState(initialProgress != null);
  const [status, setStatus] = useState<WatchStatus>(
    initialProgress?.status ?? "plan_to_watch",
  );
  const [score, setScore] = useState<number | null>(
    initialProgress?.score ?? null,
  );
  const [notes, setNotes] = useState(initialProgress?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  const watchedCount = initialProgress?.episodes_watched ?? 0;
  const hasTotal = totalEpisodes != null && totalEpisodes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((watchedCount / totalEpisodes!) * 100))
    : 0;

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
    },
    [],
  );

  /** Send a patch; on failure toast and run `revert` to roll the control back. */
  function persist(patch: ProgressPatch, revert?: () => void) {
    startTransition(async () => {
      const res = await upsertProgress(animeId, patch);
      if (!res.ok) {
        toast.error(res.error);
        revert?.();
      }
    });
  }

  function onStatusChange(next: WatchStatus) {
    const prev = status;
    setStatus(next);
    persist({ status: next }, () => setStatus(prev));
  }

  function onScoreChange(next: number) {
    const prev = score;
    setScore(next);
    persist({ score: next }, () => setScore(prev));
  }

  function clearScore() {
    const prev = score;
    setScore(null);
    persist({ score: null }, () => setScore(prev));
  }

  function onNotesChange(next: string) {
    setNotes(next);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      // Notes are free text; on failure we only toast (no destructive revert of
      // what the user typed).
      persist({ notes: next });
    }, NOTES_DEBOUNCE_MS);
  }

  function addToLibrary() {
    persist({ status }, undefined);
    setInLibrary(true);
  }

  if (!inLibrary) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">Track this anime</h2>
        <p className="text-sm text-muted-foreground">
          Add it to your library to set a status, rate it, and keep notes.
        </p>
        <Button type="button" onClick={addToLibrary} disabled={isPending}>
          {isPending ? "Adding…" : "Add to Library"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-base font-semibold">Your progress</h2>

      {/* Episode progress (read-only here; episodes are toggled in the list) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Episodes</span>
          <span className="tabular-nums text-muted-foreground">
            {watchedCount}
            {hasTotal ? ` / ${totalEpisodes}` : ""}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </div>

      {/* Status */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="status-select">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange(value as WatchStatus)}
        >
          <SelectTrigger id="status-select" className="w-full" disabled={isPending}>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {WATCH_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Score */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="score-slider">Your rating</Label>
          <span className="text-sm tabular-nums text-muted-foreground">
            {score != null ? (
              <span className="text-amber-400">★ {score} / 10</span>
            ) : (
              "Not rated"
            )}
          </span>
        </div>
        <Slider
          id="score-slider"
          min={1}
          max={10}
          step={1}
          value={score ?? 1}
          disabled={isPending}
          onValueChange={(value) =>
            onScoreChange(Array.isArray(value) ? value[0] : value)
          }
        />
        {score != null ? (
          <button
            type="button"
            onClick={clearScore}
            disabled={isPending}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Clear rating
          </button>
        ) : null}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          placeholder="Private notes…"
          rows={3}
          onChange={(e) => onNotesChange(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          Saved automatically.
        </span>
      </div>
    </div>
  );
}

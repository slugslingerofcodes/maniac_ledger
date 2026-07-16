"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { track } from "@/lib/analytics";
import { celebrateCompletion } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

import { updateProgress } from "./actions";

const STATUSES = Object.keys(WATCH_STATUS_META) as WatchStatus[];

type Props = {
  animeId: string;
  totalEpisodes: number | null;
  inLibrary: boolean;
  initial: {
    episodesWatched: number;
    status: WatchStatus;
    score: number | null;
  };
};

export function ProgressTracker({
  animeId,
  totalEpisodes,
  inLibrary,
  initial,
}: Props) {
  const router = useRouter();
  const [episodes, setEpisodes] = useState(initial.episodesWatched);
  const [status, setStatus] = useState<WatchStatus>(initial.status);
  const [score, setScore] = useState<number | null>(initial.score);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  const hasTotal = totalEpisodes != null && totalEpisodes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.round((episodes / totalEpisodes!) * 100))
    : 0;

  const dirty =
    episodes !== initial.episodesWatched ||
    status !== initial.status ||
    score !== initial.score;

  function clamp(n: number) {
    let v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
    if (totalEpisodes != null) v = Math.min(v, totalEpisodes);
    return v;
  }

  function changeEpisodes(next: number) {
    const v = clamp(next);
    setEpisodes(v);
    // Convenience: nudge status to match obvious milestones.
    if (hasTotal && v === totalEpisodes && status !== "completed") {
      setStatus("completed");
    } else if (v > 0 && status === "plan_to_watch") {
      setStatus("watching");
    }
  }

  function onSave() {
    setMessage(null);
    startTransition(async () => {
      const res = await updateProgress({
        animeId,
        episodesWatched: episodes,
        status,
        score,
      });
      if (res.ok) {
        setMessage({
          kind: "success",
          text: inLibrary ? "Progress saved." : "Added to your library.",
        });
        // Finishing here should feel the same as ticking the last episode.
        if (status === "completed" && initial.status !== "completed") {
          void celebrateCompletion("Marked completed — nice one! 🎉");
        }
        track("status_changed", { animeId, status });
        router.refresh();
      } else {
        setMessage({ kind: "error", text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your progress</h2>
        {!inLibrary ? (
          <span className="text-xs text-muted-foreground">Not in library</span>
        ) : null}
      </div>

      {/* Episodes watched */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="episodes-watched">Episodes watched</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Decrease episodes watched"
            disabled={pending || episodes <= 0}
            onClick={() => changeEpisodes(episodes - 1)}
          >
            −
          </Button>
          <Input
            id="episodes-watched"
            type="number"
            inputMode="numeric"
            min={0}
            max={totalEpisodes ?? undefined}
            value={episodes}
            onChange={(e) => changeEpisodes(e.target.valueAsNumber)}
            className="h-8 w-20 text-center"
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Increase episodes watched"
            disabled={
              pending || (totalEpisodes != null && episodes >= totalEpisodes)
            }
            onClick={() => changeEpisodes(episodes + 1)}
          >
            +
          </Button>
          <span className="text-sm text-muted-foreground">
            {hasTotal ? `of ${totalEpisodes}` : "episodes"}
          </span>
          {hasTotal && episodes < totalEpisodes! ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={pending}
              onClick={() => changeEpisodes(totalEpisodes!)}
            >
              Mark all watched
            </Button>
          ) : null}
        </div>
        {hasTotal ? (
          <div className="flex items-center gap-2">
            <Progress value={percent} className="h-1.5" />
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
              {percent}%
            </span>
          </div>
        ) : null}
      </div>

      {/* Status */}
      <div className="flex flex-col gap-2">
        <Label>Status</Label>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const meta = WATCH_STATUS_META[s];
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                disabled={pending}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  active
                    ? `border-current ${meta.className}`
                    : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="score">Your rating</Label>
        <div className="flex items-center gap-2">
          <select
            id="score"
            value={score ?? ""}
            disabled={pending}
            onChange={(e) =>
              setScore(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          >
            <option value="">Not rated</option>
            {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
              <option key={n} value={n}>
                {n} / 10
              </option>
            ))}
          </select>
          {score != null ? (
            <span className="text-sm text-amber-400">★ {score}</span>
          ) : null}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSave} disabled={pending || !dirty}>
          {pending
            ? "Saving…"
            : inLibrary
              ? "Save changes"
              : "Add to library"}
        </Button>
        {message ? (
          <span
            className={cn(
              "text-sm",
              message.kind === "success"
                ? "text-emerald-400"
                : "text-destructive",
            )}
          >
            {message.text}
          </span>
        ) : !dirty && inLibrary ? (
          <span className="text-sm text-muted-foreground">Up to date</span>
        ) : null}
      </div>
    </div>
  );
}

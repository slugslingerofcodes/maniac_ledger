"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  removeFromMangaLibraryAction,
  upsertMangaProgress,
} from "@/app/actions/manga";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { READING_STATUS_META, READING_STATUSES, type ReadingStatus } from "@/types/manga";

export function MangaReadingTracker({
  mangaId,
  inLibrary,
  totalChapters,
  totalVolumes,
  initialStatus,
  initialChapters,
  initialVolumes,
  initialScore,
}: {
  mangaId: string;
  inLibrary: boolean;
  totalChapters: number | null;
  totalVolumes: number | null;
  initialStatus: ReadingStatus;
  initialChapters: number;
  initialVolumes: number;
  initialScore: number | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [chapters, setChapters] = useState(initialChapters);
  const [volumes, setVolumes] = useState(initialVolumes);
  const [score, setScore] = useState<number | null>(initialScore);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  function clamp(n: number, max: number | null) {
    if (n < 0) return 0;
    if (max != null && n > max) return max;
    return n;
  }

  function save() {
    startSave(async () => {
      const res = await upsertMangaProgress({
        mangaId,
        status,
        chaptersRead: chapters,
        volumesRead: volumes,
        score,
      });
      if (res.ok) {
        toast.success(inLibrary ? "Progress saved." : "Added to your manga.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    if (!window.confirm("Remove this manga from your library?")) return;
    startRemove(async () => {
      const res = await removeFromMangaLibraryAction(mangaId);
      if (res.ok) {
        toast.success("Removed from your manga.");
        router.push("/manga/library");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Your progress
      </h3>

      {/* Status */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {READING_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              status === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {READING_STATUS_META[s].label}
          </button>
        ))}
      </div>

      <Counter
        label="Chapters read"
        value={chapters}
        total={totalChapters}
        onChange={(n) => setChapters(clamp(n, totalChapters))}
      />
      <Counter
        label="Volumes read"
        value={volumes}
        total={totalVolumes}
        onChange={(n) => setVolumes(clamp(n, totalVolumes))}
      />

      {/* Score */}
      <label className="mb-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Your score</span>
        <select
          value={score ?? ""}
          onChange={(e) =>
            setScore(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="button" className="flex-1" disabled={saving} onClick={save}>
          {saving ? "Saving…" : inLibrary ? "Save progress" : "Add to library"}
        </Button>
        {inLibrary ? (
          <Button
            type="button"
            variant="outline"
            disabled={removing}
            onClick={remove}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  total,
  onChange,
}: {
  label: string;
  value: number;
  total: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(value - 1)}
          className="grid size-8 place-items-center rounded-md border border-input text-foreground transition hover:bg-muted"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="min-w-16 text-center text-sm tabular-nums">
          {value}
          {total != null ? ` / ${total}` : ""}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + 1)}
          className="grid size-8 place-items-center rounded-md border border-input text-foreground transition hover:bg-muted"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

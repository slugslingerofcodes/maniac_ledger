"use client";

import { useEffect, useState, useTransition } from "react";
import { RepeatIcon } from "lucide-react";
import { toast } from "sonner";

import { getRewatchCount, incrementRewatch } from "@/app/actions/progress";

/**
 * Rewatch tracker for completed entries. The count loads lazily so the page
 * query never touches the 0017 column — if the migration isn't applied,
 * getRewatchCount returns null and this renders nothing.
 */
export function RewatchButton({ animeId }: { animeId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getRewatchCount(animeId).then((c) => {
      if (!cancelled) setCount(c);
    });
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  if (count == null) return null;

  return (
    <div className="mt-3 flex items-center justify-between rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <span className="flex items-center gap-2 text-sm">
        <RepeatIcon className="size-4 text-muted-foreground" />
        {count === 0
          ? "Watched once"
          : `Rewatched ${count}× (${count + 1} watches)`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await incrementRewatch(animeId);
            if (res.ok) {
              setCount((c) => (c ?? 0) + 1);
              toast.success("Another rewatch logged. Enjoy!");
            } else {
              toast.error(res.error);
            }
          })
        }
        className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50"
      >
        + Rewatch
      </button>
    </div>
  );
}

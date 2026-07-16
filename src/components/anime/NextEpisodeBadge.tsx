"use client";

import { useEffect, useState } from "react";

import { formatRemaining, nextBroadcastMs } from "@/lib/jst";
import { cn } from "@/lib/utils";

/**
 * Live countdown to an ongoing anime's next episode, from its weekly JST
 * broadcast slot. Ticks every second; renders nothing when the slot is
 * missing/unparsable. Shown in the detail-page hero for airing titles.
 */
export function NextEpisodeBadge({
  day,
  time,
}: {
  day: string | null;
  time: string | null;
}) {
  // The tick carries the timestamp so render never calls Date.now() itself
  // (the compiler lint forbids impure calls during render). null until the
  // first client tick, matching the old render-nothing-then-fill behavior.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = nextBroadcastMs(day, time);
  const remaining = target != null ? formatRemaining(target) : null;
  if (!remaining || target == null) return null;

  // Final hour: the wait is almost over — let the chip breathe a little.
  // motion-safe keeps it static under prefers-reduced-motion.
  const imminent = now != null && target - now < 60 * 60 * 1000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30",
        imminent && "motion-safe:animate-pulse",
      )}
    >
      <span aria-hidden>⏳</span>
      Next episode in{" "}
      <span className="font-mono tabular-nums">{remaining}</span>
    </span>
  );
}

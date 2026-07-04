"use client";

import { useEffect, useState } from "react";

import { formatRemaining, nextBroadcastMs } from "@/lib/jst";

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
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const target = nextBroadcastMs(day, time);
  const remaining = target != null ? formatRemaining(target) : null;
  if (!remaining) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30">
      <span aria-hidden>⏳</span>
      Next episode in{" "}
      <span className="font-mono tabular-nums">{remaining}</span>
    </span>
  );
}

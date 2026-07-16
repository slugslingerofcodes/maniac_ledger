"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Live JST + IST clocks for the schedule page. Broadcast slots are announced in
 * Japan time; the India clock lets local viewers read air times at a glance
 * (IST = JST − 3:30). Renders placeholders until mounted to avoid a
 * server/client hydration mismatch.
 */
const ZONES = [
  { label: "Japan · JST", tz: "Asia/Tokyo", accent: "text-primary/80" },
  { label: "India · IST", tz: "Asia/Kolkata", accent: "text-amber-300/90" },
] as const;

const CLOCKS = ZONES.map((z) => ({
  ...z,
  time: new Intl.DateTimeFormat("en-GB", {
    timeZone: z.tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }),
  date: new Intl.DateTimeFormat("en-GB", {
    timeZone: z.tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
}));

/** Once-a-second tick as an external store — no setState-in-effect. */
function subscribeTick(onChange: () => void) {
  const t = setInterval(onChange, 1000);
  return () => clearInterval(t);
}
/** Whole seconds, so the snapshot is stable within a tick (a fresh `Date`
 * every getSnapshot call would loop useSyncExternalStore forever). */
const getSeconds = () => Math.floor(Date.now() / 1000);
// Server snapshot: null → SSR renders the placeholder, exactly as before.
const getServerSeconds = () => null;

export function ScheduleClocks() {
  const seconds = useSyncExternalStore(
    subscribeTick,
    getSeconds,
    getServerSeconds,
  );
  const now = seconds == null ? null : new Date(seconds * 1000);

  return (
    <div className="flex flex-wrap items-stretch justify-center gap-3">
      {CLOCKS.map((z) => (
        <div
          key={z.tz}
          className="glass min-w-48 flex-1 rounded-2xl px-5 py-4 text-center"
        >
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-[0.2em]",
              z.accent,
            )}
          >
            {z.label}
          </span>
          <span className="mt-1 block font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
            {now ? z.time.format(now) : "--:--:--"}
          </span>
          <span className="text-xs text-muted-foreground">
            {now ? z.date.format(now) : " "}
          </span>
        </div>
      ))}
    </div>
  );
}

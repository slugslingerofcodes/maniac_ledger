"use client";

import { useEffect, useState } from "react";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Live Japan Standard Time clock — anime broadcast slots are announced in JST,
 * so the schedule page centers this above the day tabs. Renders a placeholder
 * until mounted to avoid a server/client hydration mismatch.
 */
export function JstClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
        Japan Standard Time
      </span>
      <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
        {now ? TIME_FMT.format(now) : "--:--:--"}
      </span>
      <span className="text-sm text-muted-foreground">
        {now ? DATE_FMT.format(now) : " "}
      </span>
    </div>
  );
}

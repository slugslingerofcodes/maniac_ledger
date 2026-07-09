"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** One JST day tab with its time-sorted releases (built server-side). */
export type ScheduleDay = {
  /** Short weekday label, e.g. "Thu". */
  label: string;
  /** Date line under the label, e.g. "Jul 9". */
  sub: string;
  isToday: boolean;
  rows: { malId: number; time: string; title: string }[];
};

/**
 * "Estimated Airing Schedule" panel: yesterday / today / tomorrow (JST) tabs
 * with the day's releases in broadcast order. Defaults to today; links out to
 * the full /schedule page.
 */
export function MiniSchedule({ days }: { days: ScheduleDay[] }) {
  const todayIndex = Math.max(
    0,
    days.findIndex((d) => d.isToday),
  );
  const [index, setIndex] = useState(todayIndex);
  const day = days[index];

  if (!day) return null;

  return (
    <section className="rounded-xl bg-card/70 p-3 ring-1 ring-foreground/10">
      <h2 className="flex items-center gap-1 px-1 pb-2 text-sm font-bold uppercase tracking-wide">
        <ChevronRight className="size-4 text-primary" aria-hidden />
        Estimated Airing Schedule
      </h2>

      <div className="flex items-end justify-center gap-4 border-b border-border/60 pb-2">
        {days.map((d, i) => (
          <button
            key={d.label}
            type="button"
            onClick={() => setIndex(i)}
            aria-pressed={index === i}
            className={cn(
              "flex flex-col items-center px-2 py-1 font-didot leading-none transition-colors",
              index === i
                ? "text-2xl font-bold text-foreground"
                : "text-lg text-muted-foreground hover:text-foreground",
            )}
          >
            {d.label}
            <span className="mt-1 font-sans text-[10px] font-medium tracking-wide text-muted-foreground">
              {d.sub}
            </span>
          </button>
        ))}
      </div>

      {day.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled this day.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {day.rows.map((row) => (
            <li key={`${row.malId}-${row.time}`}>
              <Link
                href={`/anime/mal/${row.malId}`}
                className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
              >
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {row.time}
                </span>
                <span className="line-clamp-1 flex-1 text-sm font-medium group-hover:text-primary">
                  {row.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/schedule"
        className="mt-2 block rounded-lg py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        View more
      </Link>
    </section>
  );
}

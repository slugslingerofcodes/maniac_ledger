"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  JST_DAYS,
  formatRemaining,
  nextBroadcastMs,
  todayInJst,
  type JstDay,
} from "@/lib/jst";
import { cn } from "@/lib/utils";

export type ScheduleItem = {
  malId: number;
  title: string;
  posterUrl: string | null;
  score: number | null;
  /** Jikan broadcast slot, JST. */
  day: string | null;
  time: string | null;
};

const DAY_LABEL: Record<JstDay, string> = {
  Sundays: "Sun",
  Mondays: "Mon",
  Tuesdays: "Tue",
  Wednesdays: "Wed",
  Thursdays: "Thu",
  Fridays: "Fri",
  Saturdays: "Sat",
};

/** Ticks once a second and renders the time left until the next episode. */
function Countdown({ day, time }: { day: string | null; time: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const target = nextBroadcastMs(day, time);
  const remaining = target != null ? formatRemaining(target) : null;
  if (!remaining) {
    return <span className="text-xs text-muted-foreground">time TBA</span>;
  }
  return (
    <span className="font-mono text-xs tabular-nums text-emerald-300">
      next ep in {remaining}
    </span>
  );
}

/**
 * Day-tabbed list of ongoing anime with their JST air time and a live
 * next-episode countdown. Defaults to "today" in Japan.
 */
export function ScheduleList({ items }: { items: ScheduleItem[] }) {
  const [day, setDay] = useState<JstDay>(todayInJst());

  const byDay = useMemo(() => {
    const map = new Map<JstDay, ScheduleItem[]>();
    for (const d of JST_DAYS) map.set(d, []);
    for (const item of items) {
      if (item.day && (JST_DAYS as readonly string[]).includes(item.day)) {
        map.get(item.day as JstDay)!.push(item);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    }
    return map;
  }, [items]);

  const dayItems = byDay.get(day) ?? [];

  return (
    <div>
      {/* Day tabs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {JST_DAYS.map((d) => {
          const active = d === day;
          const isToday = d === todayInJst();
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={active}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {DAY_LABEL[d]}
              {isToday ? " •" : ""}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {dayItems.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Nothing scheduled for this day.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dayItems.map((item) => (
            <Link
              key={item.malId}
              href={`/anime/mal/${item.malId}`}
              className="group flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-indigo-500/40"
            >
              <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt={item.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-indigo-300">
                  {item.title}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {item.time ? `${item.time} JST` : "time TBA"}
                  </Badge>
                  {item.score != null ? (
                    <span className="text-xs text-amber-400">★ {item.score}</span>
                  ) : null}
                </div>
                <div className="mt-1.5">
                  <Countdown day={item.day} time={item.time} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

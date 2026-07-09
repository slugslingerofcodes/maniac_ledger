"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";

import {
  JST_DAYS,
  formatRemaining,
  nextBroadcastMs,
  nowInJst,
  todayInJst,
  type JstDay,
} from "@/lib/jst";
import { cn } from "@/lib/utils";

export type ScheduleItem = {
  malId: number;
  title: string;
  posterUrl: string | null;
  score: number | null;
  type: string | null;
  /** Jikan broadcast slot, JST. */
  day: string | null;
  time: string | null;
};

const FULL_DAY: Record<JstDay, string> = {
  Sundays: "Sunday",
  Mondays: "Monday",
  Tuesdays: "Tuesday",
  Wednesdays: "Wednesday",
  Thursdays: "Thursday",
  Fridays: "Friday",
  Saturdays: "Saturday",
};

/* ------------------------------- Time utils ------------------------------- */

/** "15:00" → "03:00 PM". */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

/** JST "15:00" → IST "11:30 AM" (IST = JST − 3:30). */
function jstToIst(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m - 210) % 1440) + 1440) % 1440;
  const H = Math.floor(total / 60);
  const M = total % 60;
  return to12h(`${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`);
}

/** Hour bucket key for grouping, e.g. "15:30" → "15:00". */
function hourKey(hhmm: string): string {
  return `${hhmm.split(":")[0].padStart(2, "0")}:00`;
}

/** Calendar date (JST) of this week's occurrence of `target`, e.g. "Jul 9". */
function dateForDay(target: JstDay): string {
  const now = nowInJst();
  const diff = (JST_DAYS.indexOf(target) - now.getUTCDay() + 7) % 7;
  const d = new Date(now.getTime() + diff * 86_400_000);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/* -------------------------------- Countdown ------------------------------- */

function useTick(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Countdown({ day, time }: { day: string | null; time: string | null }) {
  useTick();
  const target = nextBroadcastMs(day, time);
  const remaining = target != null ? formatRemaining(target) : null;
  if (!remaining) return <span className="text-muted-foreground">TBA</span>;
  return (
    <span className="font-mono tabular-nums text-emerald-300">
      {remaining}
    </span>
  );
}

/* ------------------------------- The board -------------------------------- */

export function ScheduleList({ items }: { items: ScheduleItem[] }) {
  const [day, setDay] = useState<JstDay>(todayInJst());
  const reduce = useReducedMotion();
  const leftDoor = useAnimationControls();
  const rightDoor = useAnimationControls();
  useTick(60_000); // refresh "up next" ordering each minute

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

  // Soonest three upcoming episodes across the whole week.
  const upNext = useMemo(() => {
    return items
      .map((i) => ({ item: i, at: nextBroadcastMs(i.day, i.time) }))
      .filter((x): x is { item: ScheduleItem; at: number } => x.at != null)
      .sort((a, b) => a.at - b.at)
      .slice(0, 3)
      .map((x) => x.item);
  }, [items]);

  // Group the selected day's items into hour buckets, in broadcast order.
  const groups = useMemo(() => {
    const dayItems = byDay.get(day) ?? [];
    const map = new Map<string, ScheduleItem[]>();
    for (const item of dayItems) {
      const key = item.time ? hourKey(item.time) : "TBA";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [byDay, day]);

  const today = todayInJst();

  // Shōji doors: slide shut, swap the day underneath, slide open.
  async function pickDay(next: JstDay) {
    if (next === day) return;
    if (reduce) {
      setDay(next);
      return;
    }
    await Promise.all([
      leftDoor.start({ x: "0%" }),
      rightDoor.start({ x: "0%" }),
    ]);
    setDay(next);
    await Promise.all([
      leftDoor.start({ x: "-101%" }),
      rightDoor.start({ x: "101%" }),
    ]);
  }

  const doorTransition = { duration: 0.42, ease: "easeInOut" as const };

  return (
    <div className="flex flex-col gap-6">
      {/* Up next */}
      {upNext.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {upNext.map((item) => (
            <Link
              key={item.malId}
              href={`/anime/mal/${item.malId}`}
              className="group relative isolate flex items-center gap-3 overflow-hidden rounded-xl bg-card/70 p-3 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
            >
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt=""
                  fill
                  sizes="360px"
                  aria-hidden
                  className="-z-10 object-cover opacity-15 blur-sm"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-semibold group-hover:text-primary">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.time ? to12h(item.time) : "TBA"} JST ·{" "}
                  <Countdown day={item.day} time={item.time} />
                </p>
              </div>
              {item.posterUrl ? (
                <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10">
                  <Image
                    src={item.posterUrl}
                    alt={item.title}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Quick jumps */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {[
          { label: "Yesterday", offset: -1 },
          { label: "Today", offset: 0 },
          { label: "Tomorrow", offset: 1 },
        ].map(({ label, offset }) => {
          const target =
            JST_DAYS[(JST_DAYS.indexOf(today) + offset + 7) % 7]!;
          return (
            <button
              key={label}
              type="button"
              onClick={() => pickDay(target)}
              aria-pressed={day === target}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                day === target
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Big weekday strip */}
      <div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
          {JST_DAYS.map((d, i) => (
            <Fragment key={d}>
              {i > 0 ? (
                <span
                  aria-hidden
                  className="font-didot text-2xl text-muted-foreground/40"
                >
                  /
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => pickDay(d)}
                aria-pressed={d === day}
                className={cn(
                  "font-didot leading-none transition-colors",
                  d === day
                    ? "text-3xl font-bold text-foreground sm:text-4xl"
                    : "text-xl text-muted-foreground hover:text-foreground sm:text-2xl",
                )}
              >
                {FULL_DAY[d]}
              </button>
            </Fragment>
          ))}
        </div>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {dateForDay(day)}
          {day === today ? " · Today (JST)" : ""}
        </p>
      </div>

      {/* Day content behind the shōji doors */}
      <div className="relative isolate overflow-hidden rounded-2xl">
        {/* Sliding doors overlay (parked off-screen until a day change). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 flex"
        >
          <motion.div
            initial={{ x: "-101%" }}
            animate={leftDoor}
            transition={doorTransition}
            className="shoji-panel h-full w-1/2 border-r-2 border-[oklch(0.32_0.03_60)]"
          />
          <motion.div
            initial={{ x: "101%" }}
            animate={rightDoor}
            transition={doorTransition}
            className="shoji-panel h-full w-1/2 border-l-2 border-[oklch(0.32_0.03_60)]"
          />
        </div>

        {groups.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing scheduled for this day.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([hour, rows]) => (
              <section key={hour}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-foreground">
                  <span className="text-primary">›</span>
                  {hour === "TBA" ? "Time TBA" : to12h(hour)}
                </h3>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {rows.map((item) => (
                    <Link
                      key={item.malId}
                      href={`/anime/mal/${item.malId}`}
                      className="group relative isolate flex items-center gap-3 overflow-hidden rounded-xl bg-card/70 p-2.5 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
                    >
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt=""
                          fill
                          sizes="480px"
                          aria-hidden
                          className="-z-10 object-cover opacity-10 blur-sm"
                        />
                      ) : null}
                      <div className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/10">
                        {item.posterUrl ? (
                          <Image
                            src={item.posterUrl}
                            alt={item.title}
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-1 text-sm font-semibold group-hover:text-primary">
                          {item.title}
                        </h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.type ?? "TV"}
                          {item.score != null ? (
                            <span className="text-amber-400">
                              {" · ★ "}
                              {item.score}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs font-semibold tabular-nums">
                          {item.time ? to12h(item.time) : "TBA"}
                          <span className="text-[10px] text-muted-foreground">
                            {" JST"}
                          </span>
                        </p>
                        {item.time ? (
                          <p className="font-mono text-[10px] tabular-nums text-amber-300/80">
                            {jstToIst(item.time)} IST
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

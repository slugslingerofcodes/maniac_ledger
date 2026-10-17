"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { BrowseRow } from "@/components/browse/BrowseRow";
import { RowTabs } from "@/components/home/DiscoveryTabs";
import { PosterFallback } from "@/components/poster-fallback";

/** One JST day tab with its time-sorted releases (built server-side). */
export type ScheduleDay = {
  /** Short weekday label, e.g. "Thu". */
  label: string;
  /** Date line, e.g. "Jul 9". */
  sub: string;
  isToday: boolean;
  rows: { malId: number; time: string; title: string; posterUrl: string | null }[];
};

/**
 * Airing schedule row: yesterday / today / tomorrow (JST) in the header, the
 * chosen day's releases in broadcast order as time cards. Defaults to today;
 * the title links to the full /schedule page.
 */
export function MiniSchedule({ days }: { days: ScheduleDay[] }) {
  const todayIndex = Math.max(
    0,
    days.findIndex((d) => d.isToday),
  );
  const [index, setIndex] = useState(todayIndex);
  const day = days[index];

  if (!day) return null;

  const tabs = days.map((d, i) => ({
    key: String(i),
    label: d.isToday ? "Today" : d.label,
  }));

  return (
    <BrowseRow
      title="Airing schedule"
      eyebrow={`${day.label}, ${day.sub} · Japan time (JST)`}
      href="/schedule"
      className="pt-4"
      resetKey={String(index)}
      actions={
        <RowTabs
          tabs={tabs}
          value={String(index)}
          onChange={(k) => setIndex(Number(k))}
          label="Schedule day"
        />
      }
    >
      {day.rows.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">Nothing scheduled this day.</p>
      ) : (
        day.rows.map((row) => (
          <div
            key={`${row.malId}-${row.time}`}
            data-row-item=""
            role="listitem"
            className="w-56 shrink-0 snap-start sm:w-64"
          >
            <Link
              href={`/anime/mal/${row.malId}`}
              data-row-focus=""
              className="group flex h-20 items-center gap-3 rounded-lg bg-card p-2 pr-3 ring-1 ring-foreground/10 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[2/3] h-full shrink-0 overflow-hidden rounded-md bg-muted">
                {row.posterUrl ? (
                  <Image src={row.posterUrl} alt="" fill sizes="44px" className="object-cover" />
                ) : (
                  <PosterFallback title={row.title} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold tabular-nums text-primary">
                  {row.time}
                </p>
                <p className="line-clamp-2 text-[13px] font-medium leading-snug group-hover:text-primary">
                  {row.title}
                </p>
              </div>
            </Link>
          </div>
        ))
      )}
    </BrowseRow>
  );
}

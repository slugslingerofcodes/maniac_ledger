"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type TopTenItem = {
  malId: number;
  title: string;
  posterUrl: string | null;
  score: number | null;
  type: string | null;
};

const WINDOWS = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

/**
 * Home-page "Top 10" — ranked list with Weekly / Monthly / Yearly tabs. All
 * three lists are fetched server-side and passed in, so switching tabs is
 * instant (no refetch). Rows link to the anime detail page via mal_id.
 */
export function TopTenShowcase({
  weekly,
  monthly,
  yearly,
}: Record<WindowKey, TopTenItem[]>) {
  const [window, setWindow] = useState<WindowKey>("weekly");
  const lists: Record<WindowKey, TopTenItem[]> = { weekly, monthly, yearly };
  const items = lists[window];

  if (weekly.length + monthly.length + yearly.length === 0) return null;

  return (
    <section className="mt-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Top 10 Anime</h2>
        <div className="flex gap-1.5">
          {WINDOWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setWindow(key)}
              aria-pressed={window === key}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                window === key
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load this chart right now.
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item, i) => (
            <li key={item.malId}>
              <Link
                href={`/anime/mal/${item.malId}`}
                className="group flex items-center gap-3 rounded-xl bg-card p-2.5 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-indigo-500/40"
              >
                <span
                  className={cn(
                    "w-8 shrink-0 text-center font-didot text-2xl",
                    i < 3 ? "text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.posterUrl ? (
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium group-hover:text-indigo-300">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.score != null ? (
                      <span className="text-amber-400">★ {item.score}</span>
                    ) : null}
                    {item.score != null && item.type ? " · " : null}
                    {item.type ?? null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

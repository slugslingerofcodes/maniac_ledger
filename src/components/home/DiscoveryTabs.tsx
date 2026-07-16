"use client";

import { useState } from "react";
import { PosterTransition } from "@/components/PosterTransition";
import Image from "next/image";
import Link from "next/link";

import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import { cn } from "@/lib/utils";
import { posterTransitionName } from "@/lib/view-transition";

/** Serializable card payload for the discovery grid. */
export type DiscoveryItem = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  type: string | null;
  year: number | null;
  episodes: number | null;
  score: number | null;
};

const TABS = [
  { key: "newest", label: "Newest" },
  { key: "popular", label: "Popular" },
  { key: "topRated", label: "Top Rated" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Newest / Popular / Top Rated discovery grid. All three lists are fetched
 * server-side and passed in, so switching tabs is instant (TopTenShowcase
 * pattern).
 */
export function DiscoveryTabs(props: Record<TabKey, DiscoveryItem[]>) {
  // Only offer tabs that actually have data (an upstream slice can fail
  // independently); default to the first populated one.
  const available = TABS.filter(({ key }) => props[key].length > 0);
  const [tab, setTab] = useState<TabKey>(available[0]?.key ?? "newest");
  const [titleLang] = useTitleLanguage();
  const items = props[tab];

  if (available.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex gap-1.5">
        {available.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.malId}
            href={`/anime/mal/${item.malId}`}
            className="group flex flex-col gap-1.5"
          >
            <PosterTransition name={posterTransitionName(item.malId)}>
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-2 hover:ring-primary/40">
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 33vw, 16vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            </PosterTransition>
            <p className="line-clamp-1 text-xs font-medium group-hover:text-primary">
              <span aria-hidden className="mr-1 text-emerald-400">
                ●
              </span>
              {displayTitle(titleLang, item.title, item.titleEnglish)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {[
                item.type,
                item.year != null ? String(item.year) : null,
                item.episodes != null ? `${item.episodes} ep` : null,
                item.score != null ? `★ ${item.score}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

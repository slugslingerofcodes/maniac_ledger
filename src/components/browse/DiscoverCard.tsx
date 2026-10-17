"use client";

import type { ReactNode } from "react";
import { Check, Play, Plus } from "lucide-react";

import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import type { BrowseItem } from "@/lib/browse-item";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { CardCaption, ExpandingCard, PanelButton } from "./ExpandingCard";
import { useLibraryActions, type LibraryEntry } from "./library-state";

/** "TV · 2024 · 12 ep" — whichever parts are known. */
export function metaLine(item: Pick<BrowseItem, "type" | "year" | "episodes">): string {
  return [
    item.type,
    item.year != null ? String(item.year) : null,
    item.episodes != null ? `${item.episodes} ep` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A catalog title in a browse row: poster at rest, details and the two quick
 * actions when it lifts. Links by MAL id (`/anime/mal/[id]` resolves to the
 * catalog page), so it works for titles nobody has opened yet.
 */
export function DiscoverCard({
  item,
  entry: initialEntry = null,
  eager,
  leading,
  rankLabel,
  extraMeta,
  widthClassName,
  className,
}: {
  item: BrowseItem;
  /** The viewer's library entry for this title, when it has one. */
  entry?: LibraryEntry | null;
  eager?: boolean;
  leading?: ReactNode;
  /** "#3" — prefixed to the link's accessible name in ranked rows. */
  rankLabel?: string;
  /** One more fact for the caption and panel ("1.2M members"). */
  extraMeta?: string | null;
  widthClassName?: string;
  className?: string;
}) {
  const [lang] = useTitleLanguage();
  const title = displayTitle(lang, item.title, item.titleEnglish);
  const { entry, pending, add, markWatching } = useLibraryActions(item, initialEntry);
  const watching = entry?.status === "watching";
  const meta = [metaLine(item), extraMeta].filter(Boolean).join(" · ");

  return (
    <ExpandingCard
      href={`/anime/mal/${item.malId}`}
      title={title}
      label={rankLabel ? `${rankLabel} ${title}` : title}
      posterUrl={item.posterUrl}
      eager={eager}
      leading={leading}
      widthClassName={widthClassName}
      className={className}
      overlay={
        entry ? (
          <span
            className={`${WATCH_STATUS_META[entry.status].tokenClassName} status-edge absolute inset-y-0 left-0 w-[3px]`}
            aria-hidden
          />
        ) : null
      }
      panel={
        <>
          <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-banner-foreground/80">
            {item.score != null ? (
              <span className="font-semibold text-gold">★ {item.score.toFixed(1)}</span>
            ) : null}
            {meta ? <span>{meta}</span> : null}
          </p>
          {item.genres.length > 0 ? (
            <p className="mt-0.5 truncate text-[11px] text-banner-foreground/60">
              {item.genres.slice(0, 3).join(" · ")}
            </p>
          ) : null}
          {item.synopsis ? (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-banner-foreground/75 max-sm:hidden">
              {item.synopsis}
            </p>
          ) : null}
          {entry ? (
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
              In library · {WATCH_STATUS_META[entry.status].label}
            </p>
          ) : null}
        </>
      }
      actions={
        <>
          {entry ? null : (
            <PanelButton
              primary
              onClick={add}
              disabled={pending}
              label={`Add ${title} to your library`}
            >
              <Plus className="size-3.5" aria-hidden />
              Library
            </PanelButton>
          )}
          <PanelButton
            onClick={markWatching}
            disabled={pending || watching}
            pressed={watching}
            label={watching ? `${title}: watching` : `Mark ${title} as watching`}
          >
            {watching ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3 fill-current" aria-hidden />
            )}
            Watching
          </PanelButton>
        </>
      }
      caption={<CardCaption title={title} meta={meta || null} />}
    />
  );
}

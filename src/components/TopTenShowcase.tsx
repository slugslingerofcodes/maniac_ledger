"use client";

import { useState } from "react";

import { DiscoverCard } from "@/components/browse/DiscoverCard";
import { BrowseRow } from "@/components/browse/BrowseRow";
import { RowTabs } from "@/components/home/DiscoveryTabs";
import type { BrowseItem, LibraryEntry } from "@/lib/browse-item";
import { cn } from "@/lib/utils";

export type TopTenItem = BrowseItem & {
  /** MAL members — the viewer count the list is ranked by. */
  members: number | null;
};

const COMPACT = new Intl.NumberFormat("en", { notation: "compact" });

const WINDOWS = [
  { key: "weekly", label: "Week" },
  { key: "monthly", label: "Month" },
  { key: "yearly", label: "Year" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

/** Slot = numeral gutter + poster; the poster overlaps the numeral's right edge. */
const SLOT_WIDTH = "w-40 sm:w-48 md:w-52 lg:w-56 xl:w-60";
const SLOT_PAD = "pl-10 sm:pl-14 lg:pl-16";

/**
 * Home-page Top 10 — ranked posters with Week / Month / Year switching. All
 * three charts are fetched server-side and passed in, so switching is instant.
 *
 * The rank is set as a Didot numeral standing behind each poster, outlined
 * rather than filled; the top three are struck in gold leaf. The numeral is the
 * one decorative flourish on the page, and it encodes the ranking itself.
 */
export function TopTenShowcase({
  weekly,
  monthly,
  yearly,
  library = {},
}: Record<WindowKey, TopTenItem[]> & { library?: Record<number, LibraryEntry> }) {
  const [window, setWindow] = useState<WindowKey>("weekly");
  const lists: Record<WindowKey, TopTenItem[]> = { weekly, monthly, yearly };
  const items = lists[window];

  if (weekly.length + monthly.length + yearly.length === 0) return null;

  return (
    <BrowseRow
      title="Top 10 anime"
      eyebrow="Ranked by viewers"
      className="pt-4"
      resetKey={window}
      actions={
        <RowTabs tabs={WINDOWS} value={window} onChange={setWindow} label="Top 10 period" />
      }
    >
      {items.length === 0 ? (
        <p className="py-16 text-sm text-muted-foreground">
          This chart isn&apos;t available right now. Try another period.
        </p>
      ) : (
        items.map((item, i) => (
          <DiscoverCard
            key={item.malId}
            item={item}
            entry={library[item.malId] ?? null}
            widthClassName={SLOT_WIDTH}
            className={SLOT_PAD}
            leading={
              <span
                aria-hidden
                className={cn(
                  "top10-numeral pointer-events-none absolute bottom-11 left-0 select-none font-didot text-[6.5rem] leading-[0.78] tracking-[-0.12em] sm:text-[8.5rem] lg:text-[9.5rem]",
                  i < 3 && "top10-numeral-gold",
                )}
              >
                {i + 1}
              </span>
            }
            rankLabel={`#${i + 1}`}
            extraMeta={item.members != null ? `${COMPACT.format(item.members)} members` : null}
          />
        ))
      )}
    </BrowseRow>
  );
}

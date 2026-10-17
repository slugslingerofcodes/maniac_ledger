"use client";

import { useState } from "react";

import { DiscoverRow } from "@/components/browse/DiscoverRow";
import type { BrowseItem, LibraryEntry } from "@/lib/browse-item";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "newest", label: "New" },
  { key: "popular", label: "Popular" },
  { key: "topRated", label: "Top rated" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Segmented switcher used in row headers (Discover, Top 10). */
export function RowTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-muted p-1">
      {tabs.map(({ key, label: tabLabel }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            value === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tabLabel}
        </button>
      ))}
    </div>
  );
}

/**
 * Newest / Popular / Top rated as one row with a switcher in its header. All
 * three lists arrive from the server together, so switching is instant (no
 * refetch); the row keeps its height, so nothing below it moves.
 */
export function DiscoveryTabs({
  library,
  ...lists
}: Record<TabKey, BrowseItem[]> & { library?: Record<number, LibraryEntry> }) {
  // Only offer tabs that actually have data (an upstream slice can fail
  // independently); default to the first populated one.
  const available = TABS.filter(({ key }) => lists[key].length > 0);
  const [tab, setTab] = useState<TabKey>(available[0]?.key ?? "newest");

  if (available.length === 0) return null;
  const current = lists[tab].length > 0 ? tab : available[0]!.key;

  return (
    <DiscoverRow
      title="Discover"
      href="/search"
      actions={
        available.length > 1 ? (
          <RowTabs tabs={available} value={current} onChange={setTab} label="Discover lists" />
        ) : null
      }
      items={lists[current]}
      library={library}
      resetKey={current}
    />
  );
}

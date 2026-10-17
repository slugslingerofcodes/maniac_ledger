import type { ReactNode } from "react";

import type { BrowseItem, LibraryEntry } from "@/lib/browse-item";
import { BrowseRow } from "./BrowseRow";
import { DiscoverCard } from "./DiscoverCard";

/**
 * A row of catalog titles — the shape most home sections take. Renders nothing
 * for an empty list (an upstream tier can fail on its own), so a dead section
 * costs its slot rather than leaving a titled hole.
 */
export function DiscoverRow({
  title,
  eyebrow,
  href,
  actions,
  items,
  library = {},
  resetKey,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  href?: string;
  actions?: ReactNode;
  items: BrowseItem[];
  /** mal_id → the viewer's entry, for "In library" state and the status edge. */
  library?: Record<number, LibraryEntry>;
  /** Changing this scrolls the row back to its start (a tab switch). */
  resetKey?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <BrowseRow
      title={title}
      eyebrow={eyebrow}
      href={href}
      actions={actions}
      resetKey={resetKey}
      className={className ?? "pt-4"}
    >
      {items.map((item) => (
        <DiscoverCard key={item.malId} item={item} entry={library[item.malId] ?? null} />
      ))}
    </BrowseRow>
  );
}

import Link from "next/link";

import { BrowseRow } from "@/components/browse/BrowseRow";
import { GENRE_OPTIONS } from "@/lib/genres";

/**
 * The genre strip under the banner: one pill per genre, each deep-linking to
 * /search with that genre pre-selected. Built on the same row as everything
 * else, so it snaps, pages with the edge paddles and takes ←/→ — one tab stop
 * instead of twenty-three.
 */
export function GenreRibbon() {
  return (
    <BrowseRow
      title="Browse by genre"
      hideHeader
      className="border-b border-border/60 pattern-seigaiha"
      trackClassName="snap-proximity gap-2 py-3 sm:gap-2"
    >
      {GENRE_OPTIONS.map((g) => (
        <div key={g.id} data-row-item="" role="listitem" className="shrink-0 snap-start">
          <Link
            href={`/search?genres=${g.id}`}
            data-row-focus=""
            className="block rounded-full bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-border outline-none transition-colors hover:text-foreground hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {g.name}
          </Link>
        </div>
      ))}
    </BrowseRow>
  );
}

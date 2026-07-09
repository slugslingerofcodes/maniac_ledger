import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** One pre-formatted row for a sidebar list panel. */
export type SidebarListItem = {
  malId: number;
  title: string;
  posterUrl: string | null;
  /** Pre-formatted meta line, e.g. "TV · 2026 · ★ 8.7". */
  meta: string;
};

/**
 * Compact ranked list panel (Top Airing / Upcoming / Just Finished / Top
 * Movies): small poster thumb, two-line title, muted meta line. Server-safe —
 * rows are pre-formatted by the caller.
 */
export function SidebarList({
  title,
  items,
}: {
  title: string;
  items: SidebarListItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl bg-card/70 p-3 ring-1 ring-foreground/10">
      <h2 className="flex items-center gap-1 px-1 pb-2 text-sm font-bold uppercase tracking-wide">
        <ChevronRight className="size-4 text-primary" aria-hidden />
        {title}
      </h2>
      <ul className="divide-y divide-border/60">
        {items.map((item) => (
          <li key={item.malId}>
            <Link
              href={`/anime/mal/${item.malId}`}
              className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
            >
              <div className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded bg-muted">
                {item.posterUrl ? (
                  <Image
                    src={item.posterUrl}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.meta}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { RemoveFromListButton } from "@/components/lists/ListControls";
import { Input } from "@/components/ui/input";

export type ListItemCard = {
  animeId: string; // list_items.anime_id (catalog uuid)
  animeUuid: string; // anime.id for the detail link (same as animeId)
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
};

/**
 * Client grid of a list's anime with an in-page search that filters the items
 * of THIS list by title only (client-side; searches this list only).
 */
export function ListItemsGrid({
  items,
  listId,
  isOwner,
}: {
  items: ListItemCard[];
  listId: string;
  isOwner: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.titleEnglish?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
    <>
      <div className="mt-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search this list…"
          aria-label="Search this list"
          className="h-9 max-w-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing in this list matches “{query.trim()}”.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((item) => (
            <div key={item.animeId} className="group relative">
              {isOwner ? (
                <RemoveFromListButton listId={listId} animeId={item.animeId} />
              ) : null}
              <Link href={`/anime/${item.animeUuid}`} className="flex flex-col gap-2">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-primary/40">
                  {item.posterUrl ? (
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                  {item.titleEnglish ?? item.title}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

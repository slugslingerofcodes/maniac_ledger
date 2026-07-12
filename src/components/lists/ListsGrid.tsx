"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GlobeIcon, LockIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

export type ListCard = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  posters: string[];
  itemCount: number;
};

/**
 * Client grid of the user's lists with an in-page search that filters by list
 * name / description only (never hits the network — searches your lists only).
 */
export function ListsGrid({ lists }: { lists: ListCard[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.description?.toLowerCase().includes(q) ?? false),
    );
  }, [lists, query]);

  return (
    <>
      <div className="mt-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your lists…"
          aria-label="Search your lists"
          className="h-9 max-w-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No lists match “{query.trim()}”.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {filtered.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="group rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium group-hover:text-primary">
                    {list.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {list.itemCount} anime · {list.is_public ? "public" : "private"}
                  </p>
                </div>
                {list.is_public ? (
                  <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <LockIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              {list.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {list.description}
                </p>
              ) : null}
              {list.posters.length > 0 ? (
                <div className="mt-3 flex gap-1.5">
                  {list.posters.map((p, i) => (
                    <div
                      key={i}
                      className="relative aspect-[2/3] w-14 overflow-hidden rounded bg-muted"
                    >
                      <Image src={p} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

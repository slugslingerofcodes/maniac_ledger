"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { getUserLibrary } from "@/app/actions/library";
import { bulkUpdateStatus } from "@/app/actions/progress";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { genreChipStyle } from "@/lib/genre-color";
import { AnimeCardSkeleton } from "@/components/anime-card-skeleton";
import { LibraryCard } from "@/components/library-card";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SlimeIllustration } from "@/components/SlimeIllustration";
import { TitleLanguageToggle } from "@/components/TitleLanguageToggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

export const LIBRARY_QUERY_KEY = ["user-library"] as const;

const FIVE_MIN_MS = 5 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * Client-side library grid backed by TanStack Query. The full library is cached
 * under one key (staleTime 5m, gcTime 24h) and persisted to IndexedDB, so it
 * renders from cache while offline. Status filtering is done client-side off the
 * cached list, so switching tabs never refetches.
 */
const SORT_OPTIONS = [
  { value: "recent", label: "Recently updated" },
  { value: "title", label: "Title A–Z" },
  { value: "rating", label: "My rating" },
  { value: "genre", label: "Genre" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

/** Order the (already filtered) items for the chosen sort. */
function sortItems<T extends { title: string; score: number | null; genres: string[] }>(
  items: T[],
  sort: SortValue,
): T[] {
  if (sort === "recent") return items; // server order: updated_at desc
  const sorted = [...items];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "rating") {
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  } else {
    // Genre: alphabetical by first genre, so like-genres group together;
    // entries without genres sink to the end.
    sorted.sort((a, b) =>
      (a.genres[0] ?? "￿").localeCompare(b.genres[0] ?? "￿"),
    );
  }
  return sorted;
}

export function LibraryGridClient({ filter }: { filter: "all" | WatchStatus }) {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const [titleLang] = useTitleLanguage();
  const [genre, setGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<SortValue>("recent");
  // Bulk-edit mode: card clicks toggle selection instead of navigating.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<WatchStatus>("completed");
  const [bulkPending, startBulk] = useTransition();

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function applyBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startBulk(async () => {
      const res = await bulkUpdateStatus(ids, bulkStatus);
      if (res.ok) {
        toast.success(
          `Moved ${ids.length} ${ids.length === 1 ? "entry" : "entries"} to “${WATCH_STATUS_META[bulkStatus].label}”.`,
        );
        queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
        exitSelectMode();
      } else {
        toast.error(res.error);
      }
    });
  }
  const { data, isPending, isError } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => getUserLibrary(),
    staleTime: FIVE_MIN_MS,
    gcTime: ONE_DAY_MS,
  });

  // Every genre present in this library, for the filter chips. Hidden entirely
  // until entries carry genres (pre-0014 rows backfill as they're viewed).
  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of data ?? []) for (const g of item.genres) set.add(g);
    return [...set].sort();
  }, [data]);

  // Pull-to-refresh (mobile) invalidates the library query → refetch.
  const onRefresh = () =>
    queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });

  let content;
  if (isPending) {
    content = <GridSkeleton />;
  } else if (isError && !data) {
    // Errored (e.g. offline) AND no persisted cache to fall back on.
    content = (
      <p className="text-sm text-destructive">
        Couldn&apos;t load your library. Please try again.
      </p>
    );
  } else {
    // Swap in the preferred display title BEFORE sorting so "Title A–Z"
    // follows what the user actually sees.
    const items = sortItems(
      (data ?? [])
        .filter(
          (i) =>
            (filter === "all" || i.status === filter) &&
            (genre === null || i.genres.includes(genre)),
        )
        .map((i) => ({
          ...i,
          title: displayTitle(titleLang, i.title, i.titleEnglish),
        })),
      sort,
    );
    content = (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {genreOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <GenreChip
                label="All genres"
                active={genre === null}
                onClick={() => setGenre(null)}
              />
              {genreOptions.map((g) => (
                <GenreChip
                  key={g}
                  label={g}
                  active={genre === g}
                  onClick={() => setGenre(genre === g ? null : g)}
                />
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              selectMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
          <TitleLanguageToggle />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>
        {items.length === 0 ? (
          genre !== null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing in your library matches “{genre}” with this status.
            </p>
          ) : (
            <EmptyState isAll={filter === "all"} />
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {/* Staggered entrance on load; popLayout pops leavers out of flow
                on filter changes and layout glides survivors on sort. */}
            <AnimatePresence mode="popLayout">
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  layout={reduce ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      delay: reduce ? 0 : Math.min(i * 0.04, 0.4),
                      duration: 0.3,
                      ease: "easeOut",
                    },
                  }}
                  exit={
                    reduce
                      ? { opacity: 0, transition: { duration: 0.1 } }
                      : { opacity: 0, scale: 0.96, transition: { duration: 0.18 } }
                  }
                >
                  <div className="relative">
                    <LibraryCard item={item} />
                    {selectMode ? (
                      <button
                        type="button"
                        onClick={() => toggleSelected(item.id)}
                        aria-pressed={selected.has(item.id)}
                        aria-label={`Select ${item.title}`}
                        className={cn(
                          "absolute inset-0 z-10 rounded-lg transition",
                          selected.has(item.id)
                            ? "bg-primary/20 ring-2 ring-primary"
                            : "bg-background/10 hover:bg-background/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-2 top-2 grid size-6 place-items-center rounded-full border-2",
                            selected.has(item.id)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-foreground/40 bg-background/70",
                          )}
                        >
                          {selected.has(item.id) ? (
                            <CheckIcon className="size-4" />
                          ) : null}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Floating bulk-action bar */}
        {selectMode ? (
          <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
            <div className="glass flex flex-wrap items-center gap-3 rounded-full border border-border px-4 py-2 shadow-xl">
              <span className="text-sm font-medium tabular-nums">
                {selected.size} selected
              </span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as WatchStatus)}
                aria-label="New status"
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none"
              >
                {(Object.keys(WATCH_STATUS_META) as WatchStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {WATCH_STATUS_META[s].label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0 || bulkPending}
                onClick={applyBulk}
              >
                {bulkPending ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return <PullToRefresh onRefresh={onRefresh}>{content}</PullToRefresh>;
}

function GenreChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:brightness-125",
      )}
      style={active ? undefined : genreChipStyle(label)}
    >
      {label}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <AnimeCardSkeleton key={i} />
      ))}
    </div>
  );
}

function EmptyState({ isAll }: { isAll: boolean }) {
  return (
    <Card className="pattern-seigaiha border border-dashed border-border bg-transparent">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <SlimeIllustration className="w-40" />
        <p className="max-w-sm text-sm text-muted-foreground">
          {isAll
            ? "Your library is empty — start by searching for an anime."
            : "Nothing here with this status yet — add or update some anime."}
        </p>
        <Link href="/search" className={cn(buttonVariants())}>
          Search anime
        </Link>
      </CardContent>
    </Card>
  );
}

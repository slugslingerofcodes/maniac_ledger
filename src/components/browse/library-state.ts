"use client";

import { useCallback, useSyncExternalStore, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { addToLibraryAction } from "@/app/actions/library";
import { upsertProgress } from "@/app/actions/progress";
import { toJikanAnime, type BrowseItem, type LibraryEntry } from "@/lib/browse-item";

export type { LibraryEntry };

/*
 * Optimistic overrides, shared by every card on the page.
 *
 * The same title often appears in two rows at once (Popular and Top 10, the
 * banner and Airing now). Local component state would let one card say
 * "In library" while its twin still offers "+ Library"; a module-level store
 * read through useSyncExternalStore keeps every copy in step without a server
 * round trip. Server props stay the source of truth — an override only exists
 * from the moment the viewer acts until the page next reloads.
 */
const overrides = new Map<number, LibraryEntry | null>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setLibraryEntry(malId: number, entry: LibraryEntry | null) {
  overrides.set(malId, entry);
  for (const l of listeners) l();
}

/** Test hook: the store is module state, like jikan.ts's cache. */
export function __resetLibraryState() {
  overrides.clear();
}

export function useLibraryEntry(
  malId: number,
  initial: LibraryEntry | null,
): LibraryEntry | null {
  const override = useSyncExternalStore(
    subscribe,
    () => overrides.get(malId),
    () => undefined,
  );
  return override !== undefined ? override : initial;
}

const LIBRARY_QUERY_KEY = ["user-library"] as const;

/**
 * "+ Library" and "Mark watching" for a card or the banner, both optimistic:
 * the label flips the moment the button is pressed, the existing server actions
 * follow (`addToLibraryAction`, then `upsertProgress` for the status), and a
 * failure rolls the label back and says what went wrong.
 */
export function useLibraryActions(item: BrowseItem, initial: LibraryEntry | null) {
  const entry = useLibraryEntry(item.malId, initial);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const name = item.titleEnglish ?? item.title;

  const add = useCallback(() => {
    if (entry) return;
    setLibraryEntry(item.malId, { animeId: null, status: "plan_to_watch" });
    startTransition(async () => {
      const res = await addToLibraryAction(toJikanAnime(item));
      if (!res.ok) {
        setLibraryEntry(item.malId, null);
        toast.error(res.error);
        return;
      }
      setLibraryEntry(item.malId, { animeId: res.animeId, status: "plan_to_watch" });
      toast.success(
        res.alreadyAdded
          ? `“${name}” is already in your library.`
          : `Added “${name}” to your library.`,
      );
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    });
  }, [entry, item, name, queryClient]);

  const markWatching = useCallback(() => {
    if (entry?.status === "watching") return;
    const before = entry;
    setLibraryEntry(item.malId, { animeId: before?.animeId ?? null, status: "watching" });
    startTransition(async () => {
      let animeId = before?.animeId ?? null;
      if (!animeId) {
        const res = await addToLibraryAction(toJikanAnime(item));
        if (!res.ok) {
          setLibraryEntry(item.malId, before);
          toast.error(res.error);
          return;
        }
        animeId = res.animeId;
      }
      const updated = await upsertProgress(animeId, { status: "watching" });
      if (!updated.ok) {
        setLibraryEntry(item.malId, {
          animeId,
          status: before?.status ?? "plan_to_watch",
        });
        toast.error(updated.error);
        return;
      }
      setLibraryEntry(item.malId, { animeId, status: "watching" });
      toast.success(`Marked “${name}” as watching.`);
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    });
  }, [entry, item, name, queryClient]);

  return { entry, pending, add, markWatching };
}

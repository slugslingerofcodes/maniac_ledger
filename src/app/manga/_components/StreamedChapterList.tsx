import { after } from "next/server";

import { MangaChapterList } from "@/components/manga/MangaChapterList";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ensureMangaChapters,
  getStoredChapters,
} from "@/lib/manga-chapters";
import { createClient } from "@/lib/supabase/server";

type SyncRow = Omit<
  Parameters<typeof ensureMangaChapters>[0],
  "chapters_synced_at"
>;

/**
 * A manga's chapter list: lazily synced from MangaDex, read from the shared
 * catalog. Stored rows render as soon as they're read, with the re-sync
 * deferred until after the response (`after()`, same pattern as franchise
 * resolution) — only a manga with no rows yet waits on the sync, so its first
 * view isn't empty. Best-effort throughout: renders an empty list if all fails.
 *
 * Its own async component so the detail pages can stream it: a first-view sync
 * pages through MangaDex, and that used to hold the cover, the tracker and the
 * synopsis — everything already in hand — until it finished.
 */
export async function StreamedChapterList({
  row,
  chaptersRead,
}: {
  /** Sync identity; `mangadex_id` is filled from the catalog when unknown. */
  row: SyncRow;
  chaptersRead: number;
}) {
  const supabase = await createClient();
  // Independent reads, so together rather than in turn.
  const [{ data: syncMeta }, stored] = await Promise.all([
    supabase
      .from("manga")
      .select("mangadex_id, chapters_synced_at")
      .eq("id", row.id)
      .maybeSingle(),
    getStoredChapters(row.id),
  ]);
  const syncArgs = {
    ...row,
    mangadex_id: row.mangadex_id ?? syncMeta?.mangadex_id ?? null,
    chapters_synced_at: syncMeta?.chapters_synced_at ?? null,
  };

  let chapterRows = stored;
  if (chapterRows.length === 0) {
    await ensureMangaChapters(syncArgs);
    chapterRows = await getStoredChapters(row.id);
  } else {
    after(() => ensureMangaChapters(syncArgs));
  }

  return (
    <MangaChapterList
      chapters={chapterRows.map((c) => ({
        // numeric column — some drivers serialize it as a string.
        number: Number(c.number),
        title: c.title,
        publishedAt: c.published_at,
      }))}
      chaptersRead={chaptersRead}
    />
  );
}

/** Mirrors the chapter list in the manga detail loading.tsx. */
export function ChapterListSkeleton() {
  return (
    <section className="mt-8">
      <Skeleton className="h-5 w-28" />
      <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <ul className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 bg-card px-4 py-2.5">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-8 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-16 shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

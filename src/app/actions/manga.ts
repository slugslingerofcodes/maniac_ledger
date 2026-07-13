"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getAnilistMangaByMalId,
  searchAnilistAdultManga,
  searchAnilistManga,
} from "@/lib/anilist";
import { GENRE_OPTIONS } from "@/lib/genres";
import {
  getMangaById,
  searchAdultManga,
  searchManga,
  type JikanManga,
  type JikanMangaType,
} from "@/lib/jikan";
import {
  searchAdultMangaCatalog,
  searchMangaCatalog,
} from "@/lib/manga-catalog-fallback";
import { addToMangaLibrary } from "@/lib/manga";
import { createClient } from "@/lib/supabase/server";
import type { ReadingStatus } from "@/types/manga";

/** A manga library entry shaped for the client grid. */
export type MangaEntryItem = {
  id: string;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  coverUrl: string | null;
  status: ReadingStatus;
  chaptersRead: number;
  totalChapters: number | null;
  score: number | null;
  genres: string[];
  /** MAL media kind ("Manga" | "Manhwa" | "Manhua" | …) for the format tabs. */
  type: string | null;
};

/**
 * The signed-in user's full manga library, newest first. RLS scopes rows to the
 * current user (no explicit user_id filter — see CLAUDE.md). Used as a TanStack
 * Query `queryFn` so it can be cached like the anime library.
 */
export async function getUserMangaLibrary(): Promise<MangaEntryItem[]> {
  const supabase = await createClient();

  let { data, error } = await supabase
    .from("manga_progress")
    .select(
      "chapters_read, status, score, manga:manga_id (id, mal_id, title, title_english, cover_url, chapters, genres, type)",
    )
    .order("updated_at", { ascending: false });

  // Table created from the earlier 0022 draft (no `type` column) → retry
  // without it; the format tabs just won't discriminate until it's re-run.
  if (error && /type/i.test(error.message)) {
    const retry = await supabase
      .from("manga_progress")
      .select(
        "chapters_read, status, score, manga:manga_id (id, mal_id, title, title_english, cover_url, chapters, genres)",
      )
      .order("updated_at", { ascending: false });
    data = retry.data as unknown as typeof data;
    error = retry.error;
  }
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.manga.id,
    malId: row.manga.mal_id,
    title: row.manga.title,
    titleEnglish: row.manga.title_english,
    coverUrl: row.manga.cover_url,
    status: row.status,
    chaptersRead: row.chapters_read,
    totalChapters: row.manga.chapters,
    score: row.score,
    genres: row.manga.genres ?? [],
    type: "type" in row.manga ? row.manga.type : null,
  }));
}

export type MangaSearchSource = "mal" | "anilist" | "catalog";

export type MangaSearchResult =
  | {
      ok: true;
      results: JikanManga[];
      totalPages: number;
      /** Which engine served the results. */
      source: MangaSearchSource;
      /** True when all live APIs were unreachable (local-catalog results). */
      degraded: boolean;
    }
  | { ok: false; error: string };

/** Dedupe a manga list by mal_id, preserving order. */
function dedupeManga(list: JikanManga[]): JikanManga[] {
  const seen = new Set<number>();
  return list.filter((m) =>
    seen.has(m.mal_id) ? false : (seen.add(m.mal_id), true),
  );
}

/** MAL genre ids → names, for the catalog fallback's genre matching. */
function genreNamesOf(genreIds: number[]): string[] {
  return genreIds
    .map((id) => GENRE_OPTIONS.find((g) => g.id === id)?.name)
    .filter((n): n is string => Boolean(n));
}

/**
 * Search manga, optionally narrowed to a media kind (manga / manhwa / manhua /
 * lightnovel) and MAL genre ids (AND semantics). With an empty query it
 * browses the most popular titles.
 *
 * Fallback chain (same as the anime search API): MAL (Jikan `/manga`) →
 * AniList (country-of-origin / format mapped from the tab, genres translated
 * to AniList names) → the local `manga` catalog (degraded).
 */
export async function searchMangaAction(
  query: string,
  page = 1,
  type?: JikanMangaType,
  genreIds: number[] = [],
): Promise<MangaSearchResult> {
  try {
    const res = await searchManga(query.trim(), page, genreIds, type);
    return {
      ok: true,
      results: dedupeManga(res.data),
      totalPages: Math.max(res.pagination.last_visible_page, 1),
      source: "mal",
      degraded: false,
    };
  } catch (err) {
    console.error("[searchMangaAction] MAL failure, trying AniList:", err);
  }

  // MAL down → same search on AniList (live data, still paginated).
  try {
    const res = await searchAnilistManga(query, page, type, genreIds);
    return {
      ok: true,
      results: dedupeManga(res.data),
      totalPages: Math.max(res.pagination.last_visible_page, 1),
      source: "anilist",
      degraded: false,
    };
  } catch (err) {
    console.error("[searchMangaAction] AniList fallback failed:", err);
  }

  // Both live APIs down → the local catalog keeps known titles searchable.
  try {
    const results = await searchMangaCatalog(query, type, genreNamesOf(genreIds));
    return { ok: true, results, totalPages: 1, source: "catalog", degraded: true };
  } catch {
    return { ok: false, error: "Manga search is unavailable right now." };
  }
}

/**
 * Adult (hentai) manga search for the manga miscellaneous section — same
 * three-engine chain as {@link searchMangaAction}, scoped to MAL genre 12 /
 * AniList genre "Hentai" / catalog rows carrying the Hentai genre. The page
 * sits behind login + the 18+ gate; manga progress is only ever visible to
 * its owner (RLS), so entries need no extra privacy flag.
 */
export async function searchAdultMangaAction(
  query: string,
  page = 1,
  type?: JikanMangaType,
): Promise<MangaSearchResult> {
  try {
    const res = await searchAdultManga(query.trim(), page, type);
    return {
      ok: true,
      results: dedupeManga(res.data),
      totalPages: Math.max(res.pagination.last_visible_page, 1),
      source: "mal",
      degraded: false,
    };
  } catch (err) {
    console.error("[searchAdultMangaAction] MAL failure, trying AniList:", err);
  }

  try {
    const res = await searchAnilistAdultManga(query, page, type);
    return {
      ok: true,
      results: dedupeManga(res.data),
      totalPages: Math.max(res.pagination.last_visible_page, 1),
      source: "anilist",
      degraded: false,
    };
  } catch (err) {
    console.error("[searchAdultMangaAction] AniList fallback failed:", err);
  }

  try {
    const results = await searchAdultMangaCatalog(query, type);
    return { ok: true, results, totalPages: 1, source: "catalog", degraded: true };
  } catch {
    return { ok: false, error: "Search is unavailable right now." };
  }
}

export type AddMangaActionResult =
  | { ok: true; alreadyAdded: boolean; mangaId: string }
  | { ok: false; error: string };

/** Server Action wrapper around `addToMangaLibrary`. */
export async function addMangaToLibraryAction(
  manga: JikanManga,
): Promise<AddMangaActionResult> {
  try {
    const result = await addToMangaLibrary(manga);
    revalidatePath("/manga");
    revalidatePath("/manga/library");
    return {
      ok: true,
      alreadyAdded: "alreadyAdded" in result,
      mangaId: result.mangaId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to add to library.",
    };
  }
}

/** Adds a manga by MyAnimeList id (callers that only have a mal_id). */
export async function addMangaByMalId(
  malId: number,
): Promise<AddMangaActionResult> {
  let manga: JikanManga | null = null;
  try {
    manga = await getMangaById(malId);
  } catch {
    // MAL down → AniList carries the same record keyed by MAL id.
    try {
      manga = await getAnilistMangaByMalId(malId);
    } catch {
      /* both down */
    }
  }
  if (!manga) {
    return { ok: false, error: "Couldn't find that manga right now." };
  }
  return addMangaToLibraryAction(manga);
}

export type RemoveMangaResult = { ok: true } | { ok: false; error: string };

/** Removes a manga from the signed-in user's library (RLS-scoped delete). */
export async function removeFromMangaLibraryAction(
  mangaId: string,
): Promise<RemoveMangaResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You must be signed in to remove manga." };
  }

  const { error } = await supabase
    .from("manga_progress")
    .delete()
    .eq("manga_id", mangaId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manga");
  revalidatePath("/manga/library");
  return { ok: true };
}

const ProgressPatch = z.object({
  mangaId: z.string().uuid(),
  status: z.enum([
    "reading",
    "completed",
    "plan_to_read",
    "on_hold",
    "dropped",
  ]),
  chaptersRead: z.coerce.number().int().min(0).max(100_000),
  volumesRead: z.coerce.number().int().min(0).max(100_000).optional(),
  score: z.coerce.number().int().min(1).max(10).nullable().optional(),
});

export type UpsertMangaProgressResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Insert-or-update the user's reading progress for a manga (status, chapters,
 * volumes, score). Upserts on (user_id, manga_id) — the manga must already be
 * cataloged (it is, once viewed/added).
 */
export async function upsertMangaProgress(
  input: z.input<typeof ProgressPatch>,
): Promise<UpsertMangaProgressResult> {
  const parsed = ProgressPatch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid progress values." };
  }
  const { mangaId, status, chaptersRead, volumesRead, score } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { error } = await supabase.from("manga_progress").upsert(
    {
      user_id: user.id,
      manga_id: mangaId,
      status,
      chapters_read: chaptersRead,
      volumes_read: volumesRead ?? 0,
      score: score ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,manga_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manga");
  revalidatePath("/manga/library");
  // No detail-page revalidate: /manga/[malId] is keyed by MAL id, not this
  // catalog uuid — the tracker router.refresh()es the open page itself.
  return { ok: true };
}

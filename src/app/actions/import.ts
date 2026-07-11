"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnilistUserList, type AnilistListEntry } from "@/lib/anilist";
import type { TablesInsert } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { WatchStatus } from "@/types/anime";

/**
 * Library import from AniList (by username) or a MyAnimeList XML export.
 * Both paths funnel into one bulk upsert: catalog rows first (deduped by
 * mal_id, insert-only so existing metadata isn't clobbered by sparse import
 * data), then user_progress rows keyed on (user_id, anime_id).
 *
 * Existing library entries are NOT overwritten — imports only add missing
 * entries, so a re-import can't wipe local progress.
 */

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

type ImportEntry = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  totalEpisodes: number | null;
  /** Our anime_type enum value, best-effort. */
  type: TablesInsert<"anime">["type"] | null;
  status: WatchStatus;
  episodesWatched: number;
  /** 1–10, null when unrated. */
  score: number | null;
};

const ANILIST_STATUS: Record<string, WatchStatus> = {
  CURRENT: "watching",
  REPEATING: "watching",
  COMPLETED: "completed",
  PLANNING: "plan_to_watch",
  PAUSED: "on_hold",
  DROPPED: "dropped",
};

const ANILIST_FORMAT: Record<string, TablesInsert<"anime">["type"]> = {
  TV: "tv",
  TV_SHORT: "tv",
  MOVIE: "movie",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
  MUSIC: "music",
};

/** MAL XML `my_status` values → our enum. */
const MAL_STATUS: Record<string, WatchStatus> = {
  Watching: "watching",
  Completed: "completed",
  "On-Hold": "on_hold",
  Dropped: "dropped",
  "Plan to Watch": "plan_to_watch",
};

const MAL_TYPE: Record<string, TablesInsert<"anime">["type"]> = {
  TV: "tv",
  Movie: "movie",
  OVA: "ova",
  ONA: "ona",
  Special: "special",
  Music: "music",
};

async function bulkImport(entries: ImportEntry[]): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to import." };
  }
  if (entries.length === 0) {
    return { ok: true, imported: 0, skipped: 0 };
  }

  // 1. Contribute missing catalog rows (insert-only: never overwrite richer
  //    metadata that's already there). Chunked to stay under payload limits.
  const catalogRows: TablesInsert<"anime">[] = entries.map((e) => ({
    mal_id: e.malId,
    title: e.title,
    title_english: e.titleEnglish,
    poster_url: e.posterUrl,
    total_episodes: e.totalEpisodes,
    ...(e.type ? { type: e.type } : {}),
  }));
  for (let i = 0; i < catalogRows.length; i += 200) {
    const { error } = await supabase
      .from("anime")
      .upsert(catalogRows.slice(i, i + 200), {
        onConflict: "mal_id",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false, error: error.message };
  }

  // 2. Resolve mal_id → catalog uuid.
  const malIds = entries.map((e) => e.malId);
  const idMap = new Map<number, string>();
  for (let i = 0; i < malIds.length; i += 300) {
    const { data, error } = await supabase
      .from("anime")
      .select("id, mal_id")
      .in("mal_id", malIds.slice(i, i + 300));
    if (error) return { ok: false, error: error.message };
    for (const row of data ?? []) {
      if (row.mal_id != null) idMap.set(row.mal_id, row.id);
    }
  }

  // 3. Skip anything already in the library (imports never overwrite).
  const { data: existing, error: existingErr } = await supabase
    .from("user_progress")
    .select("anime_id");
  if (existingErr) return { ok: false, error: existingErr.message };
  const tracked = new Set((existing ?? []).map((r) => r.anime_id));

  const progressRows: TablesInsert<"user_progress">[] = [];
  let skipped = 0;
  for (const e of entries) {
    const animeId = idMap.get(e.malId);
    if (!animeId || tracked.has(animeId)) {
      skipped++;
      continue;
    }
    progressRows.push({
      user_id: user.id,
      anime_id: animeId,
      status: e.status,
      episodes_watched: Math.max(0, e.episodesWatched),
      score: e.score,
    });
  }

  for (let i = 0; i < progressRows.length; i += 200) {
    const { error } = await supabase
      .from("user_progress")
      .upsert(progressRows.slice(i, i + 200), {
        onConflict: "user_id,anime_id",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/library");
  revalidatePath("/");

  return { ok: true, imported: progressRows.length, skipped };
}

/** Import a user's public AniList anime list by username. */
export async function importFromAnilist(username: string): Promise<ImportResult> {
  const parsed = z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,30}$/, "That doesn't look like an AniList username.")
    .safeParse(username);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }

  let list: AnilistListEntry[];
  try {
    list = await getAnilistUserList(parsed.data);
  } catch {
    return {
      ok: false,
      error:
        "Couldn't fetch that AniList profile — check the username and that the list is public.",
    };
  }

  const entries: ImportEntry[] = list.map((e) => ({
    malId: e.malId,
    title: e.title,
    titleEnglish: e.titleEnglish,
    posterUrl: e.posterUrl,
    totalEpisodes: e.totalEpisodes,
    type: e.format ? (ANILIST_FORMAT[e.format] ?? null) : null,
    status: ANILIST_STATUS[e.status] ?? "plan_to_watch",
    episodesWatched: e.progress,
    score: e.score >= 1 && e.score <= 10 ? Math.round(e.score) : null,
  }));

  return bulkImport(entries);
}

const MAX_XML_BYTES = 8 * 1024 * 1024;

function tag(block: string, name: string): string | null {
  // MAL exports wrap text values in CDATA; numbers are bare.
  const m = new RegExp(
    `<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`,
  ).exec(block);
  return m ? m[1]!.trim() : null;
}

/** Import a MyAnimeList XML export (myanimelist.net → Panel → Export). */
export async function importFromMalXml(xml: string): Promise<ImportResult> {
  if (typeof xml !== "string" || xml.length === 0) {
    return { ok: false, error: "Empty file." };
  }
  if (xml.length > MAX_XML_BYTES) {
    return { ok: false, error: "File too large (max 8 MB)." };
  }
  if (!xml.includes("<myanimelist")) {
    return { ok: false, error: "That doesn't look like a MyAnimeList export." };
  }

  const entries: ImportEntry[] = [];
  const blocks = xml.match(/<anime>[\s\S]*?<\/anime>/g) ?? [];
  for (const block of blocks) {
    const malId = Number(tag(block, "series_animedb_id"));
    const title = tag(block, "series_title");
    if (!Number.isInteger(malId) || malId <= 0 || !title) continue;

    const scoreRaw = Number(tag(block, "my_score"));
    const episodes = Number(tag(block, "series_episodes"));
    const typeRaw = tag(block, "series_type");

    entries.push({
      malId,
      title,
      titleEnglish: null,
      posterUrl: null,
      totalEpisodes: Number.isInteger(episodes) && episodes > 0 ? episodes : null,
      type: typeRaw ? (MAL_TYPE[typeRaw] ?? null) : null,
      status: MAL_STATUS[tag(block, "my_status") ?? ""] ?? "plan_to_watch",
      episodesWatched: Math.max(0, Number(tag(block, "my_watched_episodes")) || 0),
      score: scoreRaw >= 1 && scoreRaw <= 10 ? scoreRaw : null,
    });
  }

  if (entries.length === 0) {
    return { ok: false, error: "No anime entries found in that file." };
  }

  return bulkImport(entries);
}

import { cache } from "react";

import type { LibraryEntry } from "@/lib/browse-item";
import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { AiringStatus, AnimeType, WatchStatus } from "@/types/anime";

/** One library entry, flattened, with everything the home rows read. */
export type LibrarySnapshotRow = {
  animeId: string;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  posterUrl: string | null;
  type: AnimeType | null;
  totalEpisodes: number | null;
  airing: AiringStatus | null;
  genres: string[];
  franchiseId: string | null;
  status: WatchStatus;
  score: number | null;
  episodesWatched: number;
  lastWatchedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
};

const FULL_SELECT =
  "status, score, episodes_watched, last_watched_at, updated_at, created_at, anime:anime_id (id, mal_id, title, title_english, poster_url, type, total_episodes, status, genres, franchise_id)";
/** Pre-0014 schema (no genres/franchise_id): the rows still load, just unpersonalized. */
const MINIMAL_SELECT =
  "status, score, episodes_watched, last_watched_at, updated_at, created_at, anime:anime_id (id, mal_id, title, title_english, poster_url, type, total_episodes, status)";

/**
 * The viewer's whole library in **one** query, shared by every home row that
 * needs it — Continue Watching, Airing from your list, Your Library, Because
 * you watched, and the "In library" state on every discovery card.
 *
 * Before this, four sections each ran their own `user_progress` query. React
 * `cache` scopes this to a single server render, so the rows still stream
 * independently (none waits on another) but share one round trip.
 *
 * The `user_id` filter is required, not redundant: migration 0015 made public
 * profiles' progress readable, and permissive RLS policies OR together — an
 * unfiltered read returns strangers' rows too (see CLAUDE.md).
 *
 * Never throws: a library problem should empty the personal rows, not break
 * the page.
 */
export const getLibrarySnapshot = cache(async (): Promise<LibrarySnapshotRow[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();

  type Row = {
    status: WatchStatus;
    score: number | null;
    episodes_watched: number;
    last_watched_at: string | null;
    updated_at: string | null;
    created_at: string | null;
    anime: {
      id: string;
      mal_id: number | null;
      title: string;
      title_english: string | null;
      poster_url: string | null;
      type: AnimeType | null;
      total_episodes: number | null;
      status: AiringStatus | null;
      genres?: string[] | null;
      franchise_id?: string | null;
    } | null;
  };

  let rows: Row[] | null = null;
  try {
    const full = await supabase
      .from("user_progress")
      .select(FULL_SELECT)
      .eq("user_id", user.id);
    if (!full.error) {
      rows = full.data as unknown as Row[];
    } else {
      const minimal = await supabase
        .from("user_progress")
        .select(MINIMAL_SELECT)
        .eq("user_id", user.id);
      if (minimal.error) return [];
      rows = minimal.data as unknown as Row[];
    }
  } catch {
    return [];
  }

  return (rows ?? [])
    .filter((r): r is Row & { anime: NonNullable<Row["anime"]> } => r.anime != null)
    .map((r) => ({
      animeId: r.anime.id,
      malId: r.anime.mal_id,
      title: r.anime.title,
      titleEnglish: r.anime.title_english,
      posterUrl: r.anime.poster_url,
      type: r.anime.type,
      totalEpisodes: r.anime.total_episodes,
      airing: r.anime.status,
      genres: r.anime.genres ?? [],
      franchiseId: r.anime.franchise_id ?? null,
      status: r.status,
      score: r.score,
      episodesWatched: r.episodes_watched,
      lastWatchedAt: r.last_watched_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    }));
});

/** mal_id → library entry, for the "In library" state on discovery cards. */
export function indexByMalId(rows: LibrarySnapshotRow[]): Record<number, LibraryEntry> {
  const index: Record<number, LibraryEntry> = {};
  for (const r of rows) {
    if (r.malId != null) index[r.malId] = { animeId: r.animeId, status: r.status };
  }
  return index;
}

/** Convenience for row components: the snapshot's index, cached alongside it. */
export const getLibraryIndex = cache(async () => indexByMalId(await getLibrarySnapshot()));

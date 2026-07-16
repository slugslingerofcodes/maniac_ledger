"use server";

import { searchAnilist } from "@/lib/anilist";
import { browseCatalog, searchCatalog } from "@/lib/catalog-fallback";
import {
  getAnimePictures,
  getTopAnime,
  searchAnime,
  type JikanAnime,
} from "@/lib/jikan";

/** A single key visual, tagged with the anime it belongs to. */
export type AnimePoster = {
  /** Stable key — the same art can appear under one anime more than once. */
  id: string;
  animeMalId: number;
  animeTitle: string;
  year: number | null;
  url: string;
  thumbUrl: string;
};

/** Which engine answered. Only MAL has per-title poster gallery data. */
export type PostersSource = "mal" | "anilist" | "catalog";

export type PostersResult =
  | {
      ok: true;
      posters: AnimePoster[];
      animeCount: number;
      degraded: boolean;
      /** Where the titles came from — non-MAL sources carry one cover each. */
      source: PostersSource;
    }
  | { ok: false; error: string };

/**
 * How many anime we pull posters for in one go. Every title costs one extra
 * Jikan call through the ~350ms serial queue, so this is a deliberate ceiling:
 * 8 titles ≈ 9 calls ≈ 3s cold, and free once the day-cache is warm.
 */
const MAX_ANIME = 8;

/**
 * Titles shown per page in the cover-only fallback modes. One image per anime
 * there, so pull more titles than MAX_ANIME to keep the grid full.
 */
const FALLBACK_ANIME = 24;

function posterUrlsOf(
  anime: Pick<JikanAnime, "mal_id" | "title" | "title_english" | "year">,
  pictures: { jpg?: { image_url: string | null; large_image_url: string | null } }[],
): AnimePoster[] {
  const title = anime.title_english ?? anime.title;
  const seen = new Set<string>();
  const out: AnimePoster[] = [];
  for (const pic of pictures) {
    const url = pic.jpg?.large_image_url ?? pic.jpg?.image_url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: `${anime.mal_id}:${url}`,
      animeMalId: anime.mal_id,
      animeTitle: title,
      year: anime.year ?? null,
      url,
      thumbUrl: pic.jpg?.image_url ?? url,
    });
  }
  return out;
}

/** One poster per anime from its main cover — all a non-MAL source has. */
function coversOf(anime: JikanAnime[]): AnimePoster[] {
  const out: AnimePoster[] = [];
  for (const a of anime) {
    const cover = a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url;
    if (!cover) continue;
    out.push({
      id: `${a.mal_id}:${cover}`,
      animeMalId: a.mal_id,
      animeTitle: a.title_english ?? a.title,
      year: a.year ?? null,
      url: cover,
      thumbUrl: a.images?.jpg?.image_url ?? cover,
    });
  }
  return out;
}

/**
 * Every poster MAL has for the anime matching `query`, flattened into one list.
 * An empty query browses the current top titles instead, so the tab is never
 * blank on arrival.
 *
 * Fallback chain (same shape as the search API): MAL → AniList → the local
 * catalog. Only MAL exposes per-title poster galleries, so the fallbacks show
 * each title's main cover instead — degraded but never a dead tab. Poster
 * fetches on the MAL path run in parallel; a failure for one title never sinks
 * the rest (`allSettled`), which matters because MAL 504s on individual
 * endpoints fairly often.
 */
export async function fetchAnimePosters(query: string): Promise<PostersResult> {
  const q = query.trim();

  let anime: JikanAnime[] = [];
  try {
    const res = q ? await searchAnime(q, 1) : await getTopAnime(MAX_ANIME);
    anime = res.data.slice(0, MAX_ANIME);
  } catch (err) {
    console.error("[fetchAnimePosters] MAL failure, trying AniList:", err);

    // MAL down → the same lookup on AniList (empty filters browse by
    // popularity). Covers only: AniList has no poster-gallery endpoint.
    try {
      const res = await searchAnilist(q ? { query: q } : {}, 1);
      const covers = coversOf(res.data.slice(0, FALLBACK_ANIME));
      return {
        ok: true,
        posters: covers,
        animeCount: covers.length,
        degraded: true,
        source: "anilist",
      };
    } catch (anilistErr) {
      console.error("[fetchAnimePosters] AniList fallback failed:", anilistErr);
    }

    // Both live engines down → covers from our own catalog.
    try {
      const rows = q
        ? await searchCatalog(q, [], FALLBACK_ANIME)
        : await browseCatalog(FALLBACK_ANIME);
      const covers = coversOf(rows);
      if (covers.length > 0) {
        return {
          ok: true,
          posters: covers,
          animeCount: covers.length,
          degraded: true,
          source: "catalog",
        };
      }
    } catch (catalogErr) {
      console.error("[fetchAnimePosters] catalog fallback failed:", catalogErr);
    }

    return {
      ok: false,
      error: q
        ? "Couldn't search anime right now — MyAnimeList may be down."
        : "Couldn't load anime right now — MyAnimeList may be down.",
    };
  }

  if (anime.length === 0) {
    return { ok: true, posters: [], animeCount: 0, degraded: false, source: "mal" };
  }

  const settled = await Promise.allSettled(
    anime.map((a) => getAnimePictures(a.mal_id)),
  );

  const posters: AnimePoster[] = [];
  let failures = 0;
  settled.forEach((res, i) => {
    const a = anime[i]!;
    if (res.status === "fulfilled") {
      posters.push(...posterUrlsOf(a, res.value.data ?? []));
    } else {
      failures++;
      // No pictures for this title — fall back to its main cover so the anime
      // is still represented rather than vanishing from the grid.
      const cover = a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url;
      if (cover) {
        posters.push({
          id: `${a.mal_id}:${cover}`,
          animeMalId: a.mal_id,
          animeTitle: a.title_english ?? a.title,
          year: a.year ?? null,
          url: cover,
          thumbUrl: a.images?.jpg?.image_url ?? cover,
        });
      }
    }
  });

  return {
    ok: true,
    posters,
    animeCount: anime.length,
    degraded: failures > 0,
    source: "mal",
  };
}

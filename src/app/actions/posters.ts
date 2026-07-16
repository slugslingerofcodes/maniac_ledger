"use server";

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

export type PostersResult =
  | {
      ok: true;
      posters: AnimePoster[];
      animeCount: number;
      degraded: boolean;
      /** Another page of anime exists upstream. */
      hasMore: boolean;
    }
  | { ok: false; error: string };

/**
 * How many anime we pull posters for in one go. Every title costs one extra
 * Jikan call through the ~350ms serial queue, so this is a deliberate ceiling:
 * 8 titles ≈ 9 calls ≈ 3s cold, and free once the day-cache is warm.
 */
const MAX_ANIME = 8;

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

/**
 * Every poster MAL has for the anime matching `query`, flattened into one list.
 *
 * An empty query browses the current top titles instead, so the tab is never
 * blank on arrival. `page` walks further down that list — each page is another
 * batch of up to MAX_ANIME titles and all of their posters, which is what the
 * grid's "Load more" appends. Poster fetches run in parallel — they still
 * serialise inside the Jikan queue, but a failure for one title never sinks the
 * rest (`allSettled`), which matters because MAL 504s on individual endpoints
 * fairly often.
 */
export async function fetchAnimePosters(
  query: string,
  page = 1,
): Promise<PostersResult> {
  const q = query.trim();

  let anime: JikanAnime[] = [];
  let hasMore = false;
  try {
    // Both engines page in MAX_ANIME-sized batches. Pushing the limit down to
    // Jikan is what keeps paging honest: taking a slice of its default 25-result
    // page would drop the rest, and page 2 would resume past them.
    const res = q
      ? await searchAnime(q, page, [], { limit: MAX_ANIME })
      : await getTopAnime(MAX_ANIME, page);
    anime = res.data.slice(0, MAX_ANIME);
    hasMore = res.pagination.has_next_page;
  } catch {
    return {
      ok: false,
      error: q
        ? "Couldn't search anime right now — MyAnimeList may be down."
        : "Couldn't load anime right now — MyAnimeList may be down.",
    };
  }

  if (anime.length === 0) {
    return { ok: true, posters: [], animeCount: 0, degraded: false, hasMore: false };
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
    hasMore,
  };
}

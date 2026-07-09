/**
 * Minimal typed client for the AnimeThemes.moe public API
 * (https://api.animethemes.moe) — the community archive of anime opening and
 * ending themes. Used by the /songs player. CORS is open, so these helpers
 * run straight from client components; audio files are served from
 * a.animethemes.moe as .ogg (no Safari support — the player surfaces that).
 */

const BASE_URL = "https://api.animethemes.moe";

/** Everything the player needs: theme → song → artists → audio/video links. */
const INCLUDES =
  "animethemes.animethemeentries.videos.audio,animethemes.song.artists,images";

/* ----------------------------- Response types ---------------------------- */

interface ApiImage {
  facet: string | null;
  link: string;
}

interface ApiVideo {
  link: string;
  audio: { link: string } | null;
}

interface ApiTheme {
  id: number;
  slug: string; // "OP1", "ED2", …
  type: "OP" | "ED" | string;
  song: { title: string | null; artists: { name: string }[] } | null;
  animethemeentries: { videos: ApiVideo[] }[];
}

interface ApiAnime {
  name: string;
  slug: string;
  images: ApiImage[];
  animethemes: ApiTheme[];
}

interface ApiAnimeListResponse {
  anime: ApiAnime[];
}

/* ------------------------------ Public types ----------------------------- */

export type ThemeTrack = {
  /** Unique per theme, stable across refetches. */
  id: string;
  animeName: string;
  /** "OP1" / "ED2" — display chip. */
  themeSlug: string;
  songTitle: string;
  artists: string[];
  audioUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
};

export type AnimeSeasonName = "Winter" | "Spring" | "Summer" | "Fall";

/** The season we're currently in, for the default "this season" view. */
export function currentAnimeSeason(): { year: number; season: AnimeSeasonName } {
  const now = new Date();
  const season = (["Winter", "Spring", "Summer", "Fall"] as const)[
    Math.floor(now.getMonth() / 3)
  ]!;
  return { year: now.getFullYear(), season };
}

/* --------------------------------- Fetch --------------------------------- */

function toTracks(anime: ApiAnime[]): ThemeTrack[] {
  const tracks: ThemeTrack[] = [];
  for (const a of anime) {
    const poster =
      a.images.find((i) => i.facet === "large_cover")?.link ??
      a.images[0]?.link ??
      null;
    for (const theme of a.animethemes) {
      const video = theme.animethemeentries[0]?.videos[0];
      tracks.push({
        id: `${a.slug}-${theme.slug}-${theme.id}`,
        animeName: a.name,
        themeSlug: theme.slug,
        songTitle: theme.song?.title || theme.slug,
        artists: (theme.song?.artists ?? []).map((ar) => ar.name),
        audioUrl: video?.audio?.link ?? null,
        videoUrl: video?.link ?? null,
        posterUrl: poster,
      });
    }
  }
  // Playable tracks only; keep OP1, ED1, OP2… ordering within each anime.
  return tracks.filter((t) => t.audioUrl != null);
}

async function fetchAnime(query: string): Promise<ThemeTrack[]> {
  const res = await fetch(`${BASE_URL}/anime?${query}&include=${INCLUDES}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`AnimeThemes request failed (${res.status})`);
  }
  const body = (await res.json()) as ApiAnimeListResponse;
  return toTracks(body.anime ?? []);
}

/** All archived themes for one anime, looked up by its MyAnimeList id. */
export function getThemesByMalId(malId: number): Promise<ThemeTrack[]> {
  const params = new URLSearchParams({
    "filter[has]": "resources",
    "filter[site]": "MyAnimeList",
    "filter[external_id]": String(malId),
  });
  return fetchAnime(params.toString());
}

/** Themes for a broadcast season — the player's default browse view. */
export function getSeasonThemes(
  year: number,
  season: AnimeSeasonName,
  pageSize = 12,
): Promise<ThemeTrack[]> {
  const params = new URLSearchParams({
    "filter[year]": String(year),
    "filter[season]": season,
    "page[size]": String(pageSize),
  });
  return fetchAnime(params.toString());
}

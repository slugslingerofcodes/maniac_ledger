import type { JikanAnime, JikanManga, JikanSearchResponse } from "@/lib/jikan";

/**
 * Minimal upstream fixtures. Deliberately hand-built rather than captured from
 * a live API: the point is to pin the shapes our mappers and fallback chains
 * depend on, so a test failure means our contract moved, not that MAL changed
 * a synopsis.
 */

/** A `fetch` Response stand-in carrying a JSON body. */
export function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  };
}

export function animeFixture(overrides: Partial<JikanAnime> = {}): JikanAnime {
  const images = {
    image_url: "https://cdn.example/poster.jpg",
    small_image_url: "https://cdn.example/poster-s.jpg",
    large_image_url: "https://cdn.example/poster-l.jpg",
  };
  return {
    mal_id: 52991,
    title: "Sousou no Frieren",
    title_english: "Frieren: Beyond Journey's End",
    synopsis: "An elf mage outlives her party.",
    type: "TV",
    episodes: 28,
    score: 9.3,
    scored_by: 500_000,
    members: 1_000_000,
    status: "Finished Airing",
    season: "fall",
    year: 2023,
    images: { jpg: images, webp: images },
    genres: [{ mal_id: 2, type: "anime", name: "Adventure", url: "" }],
    studios: [{ mal_id: 11, type: "anime", name: "Madhouse", url: "" }],
    ...overrides,
  };
}

export function paginationFixture(overrides: Partial<JikanSearchResponse["pagination"]> = {}) {
  return {
    last_visible_page: 1,
    has_next_page: false,
    current_page: 1,
    items: { count: 1, total: 1, per_page: 25 },
    ...overrides,
  };
}

/** A one-result `/anime` search payload. */
export function searchPayload(title = "Sousou no Frieren"): JikanSearchResponse {
  return {
    data: [animeFixture({ title })],
    pagination: paginationFixture(),
  };
}

export function mangaFixture(overrides: Partial<JikanManga> = {}): JikanManga {
  const images = {
    image_url: "https://cdn.example/manga.jpg",
    small_image_url: "https://cdn.example/manga-s.jpg",
    large_image_url: "https://cdn.example/manga-l.jpg",
  };
  return {
    mal_id: 2,
    title: "Berserk",
    title_english: "Berserk",
    synopsis: "A lone mercenary.",
    type: "Manga",
    chapters: null,
    volumes: null,
    score: 9.4,
    status: "Publishing",
    images: { jpg: images, webp: images },
    genres: [{ mal_id: 1, type: "manga", name: "Action", url: "" }],
    authors: [{ mal_id: 1868, type: "people", name: "Miura, Kentarou", url: "" }],
    ...overrides,
  } as JikanManga;
}

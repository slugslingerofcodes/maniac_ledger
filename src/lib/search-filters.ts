/**
 * Shared definitions for the /search filter bar. Both the client UI and the
 * /api/anime/search route validate against these lists, so a filter can't be
 * rendered that the API would reject (or vice versa).
 *
 * Engine note: filters marked "AniList-only" below can't be expressed as Jikan
 * `/anime` query params — when any of them is active, the search route queries
 * AniList directly instead of MAL. Everything else runs on MAL (Jikan) first,
 * with AniList as the outage fallback.
 */

export const SEASONS = ["winter", "spring", "summer", "fall"] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<Season, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** Media format. `jikan` is the `type` search param; `anilist` is MediaFormat. */
export const FORMAT_OPTIONS = [
  { value: "tv", label: "TV", jikan: "tv", anilist: "TV" },
  { value: "movie", label: "Movie", jikan: "movie", anilist: "MOVIE" },
  { value: "ova", label: "OVA", jikan: "ova", anilist: "OVA" },
  { value: "ona", label: "ONA", jikan: "ona", anilist: "ONA" },
  { value: "special", label: "Special", jikan: "special", anilist: "SPECIAL" },
  { value: "music", label: "Music", jikan: "music", anilist: "MUSIC" },
] as const;
export type FormatValue = (typeof FORMAT_OPTIONS)[number]["value"];

/** Airing status. `jikan` is the `status` param; `anilist` is MediaStatus. */
export const STATUS_OPTIONS = [
  { value: "airing", label: "Airing", jikan: "airing", anilist: "RELEASING" },
  {
    value: "complete",
    label: "Finished",
    jikan: "complete",
    anilist: "FINISHED",
  },
  {
    value: "upcoming",
    label: "Not Yet Aired",
    jikan: "upcoming",
    anilist: "NOT_YET_RELEASED",
  },
] as const;
export type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

/** AniList-only — `licensedBy_in` site names (must match AniList exactly). */
export const STREAMING_OPTIONS = [
  "Crunchyroll",
  "Netflix",
  "Hulu",
  "HIDIVE",
  "Amazon Prime Video",
  "Disney Plus",
] as const;
export type StreamingValue = (typeof STREAMING_OPTIONS)[number];

/** AniList-only — `countryOfOrigin` ISO codes. */
export const COUNTRY_OPTIONS = [
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "CN", label: "China" },
  { value: "TW", label: "Taiwan" },
] as const;
export type CountryValue = (typeof COUNTRY_OPTIONS)[number]["value"];

/** AniList-only — `source_in` MediaSource values. */
export const SOURCE_OPTIONS = [
  { value: "ORIGINAL", label: "Original" },
  { value: "MANGA", label: "Manga" },
  { value: "LIGHT_NOVEL", label: "Light Novel" },
  { value: "WEB_NOVEL", label: "Web Novel" },
  { value: "NOVEL", label: "Novel" },
  { value: "VISUAL_NOVEL", label: "Visual Novel" },
  { value: "VIDEO_GAME", label: "Video Game" },
  { value: "DOUJINSHI", label: "Doujinshi" },
  { value: "OTHER", label: "Other" },
] as const;
export type SourceValue = (typeof SOURCE_OPTIONS)[number]["value"];

/**
 * AniList-only — curated `tag_in` names for the "Advanced Genres & Tag
 * Filters" section. Must match AniList tag names exactly (unknown names make
 * the whole query fail validation).
 */
export const TAG_OPTIONS = [
  "Isekai",
  "Time Manipulation",
  "Time Loop",
  "Reincarnation",
  "Revenge",
  "Anti-Hero",
  "Villainess",
  "Dystopian",
  "Post-Apocalyptic",
  "Space",
  "Cyberpunk",
  "Demons",
  "Vampire",
  "Zombie",
  "Ghost",
  "Youkai",
  "Samurai",
  "Ninja",
  "Military",
  "War",
  "Magic",
  "Dragons",
  "Mythology",
  "Super Power",
  "Martial Arts",
  "School",
  "Idol",
  "Band",
  "Food",
  "Iyashikei",
  "Parody",
  "Satire",
  "Gore",
  "Tragedy",
  "Love Triangle",
  "Female Harem",
  "Female Protagonist",
  "Male Protagonist",
  "Coming of Age",
  "Found Family",
  "Survival",
  "Battle Royale",
  "Detective",
  "Gambling",
] as const;
export type TagValue = (typeof TAG_OPTIONS)[number];

/** Bounds for the range sliders. Max values are open-ended ("150+"). */
export const YEAR_MIN = 1960;
export const YEAR_MAX = new Date().getFullYear() + 1;
export const EPISODES_MAX = 150;
export const DURATION_MAX = 180;

/** Year dropdown options, newest first. */
export const YEAR_OPTIONS: number[] = Array.from(
  { length: YEAR_MAX - YEAR_MIN + 1 },
  (_, i) => YEAR_MAX - i,
);

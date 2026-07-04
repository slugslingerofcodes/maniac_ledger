/**
 * Curated MyAnimeList genres, themes, and demographics for the search filter
 * chips. The ids are MAL's stable genre ids (Jikan's `genres` search param
 * accepts genres, themes, and demographics interchangeably), hardcoded to
 * avoid an extra API round-trip for a list that hasn't changed in years.
 */

export type GenreOption = {
  id: number;
  name: string;
  kind: "genre" | "theme" | "demographic";
};

export const GENRE_OPTIONS: GenreOption[] = [
  // Genres
  { id: 1, name: "Action", kind: "genre" },
  { id: 2, name: "Adventure", kind: "genre" },
  { id: 4, name: "Comedy", kind: "genre" },
  { id: 8, name: "Drama", kind: "genre" },
  { id: 10, name: "Fantasy", kind: "genre" },
  { id: 14, name: "Horror", kind: "genre" },
  { id: 7, name: "Mystery", kind: "genre" },
  { id: 22, name: "Romance", kind: "genre" },
  { id: 24, name: "Sci-Fi", kind: "genre" },
  { id: 36, name: "Slice of Life", kind: "genre" },
  { id: 30, name: "Sports", kind: "genre" },
  { id: 37, name: "Supernatural", kind: "genre" },
  { id: 41, name: "Suspense", kind: "genre" },
  // Themes ("tags")
  { id: 62, name: "Isekai", kind: "theme" },
  { id: 23, name: "School", kind: "theme" },
  { id: 40, name: "Psychological", kind: "theme" },
  { id: 18, name: "Mecha", kind: "theme" },
  { id: 19, name: "Music", kind: "theme" },
  { id: 13, name: "Historical", kind: "theme" },
  { id: 17, name: "Martial Arts", kind: "theme" },
  // Demographics
  { id: 27, name: "Shounen", kind: "demographic" },
  { id: 25, name: "Shoujo", kind: "demographic" },
  { id: 42, name: "Seinen", kind: "demographic" },
];

"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { GENRE_OPTIONS } from "@/lib/genres";
import {
  COUNTRY_OPTIONS,
  FORMAT_OPTIONS,
  SEASONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  STREAMING_OPTIONS,
  TAG_OPTIONS,
} from "@/lib/search-filters";

/**
 * Natural-language search: "something like Frieren but darker, under 30
 * episodes" → structured filters for the existing /api/anime/search engine.
 * Gemini (same key/model as recommendations) returns strict JSON which is
 * validated against the app's real option lists — anything it hallucinates is
 * dropped, so the result can always be applied safely.
 */

const RawSchema = z.object({
  query: z.string().max(120).nullable().optional(),
  genres: z.array(z.string()).max(5).nullable().optional(),
  tags: z.array(z.string()).max(5).nullable().optional(),
  year: z.number().int().nullable().optional(),
  min_year: z.number().int().nullable().optional(),
  max_year: z.number().int().nullable().optional(),
  season: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  streaming: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  min_episodes: z.number().int().nullable().optional(),
  max_episodes: z.number().int().nullable().optional(),
});

/** Cleaned filters, every value guaranteed to be in the app's option lists. */
export type ParsedNlFilters = {
  query: string;
  genreIds: number[];
  tags: string[];
  year: number | null;
  minYear: number | null;
  maxYear: number | null;
  season: string | null;
  format: string | null;
  status: string | null;
  streaming: string | null;
  country: string | null;
  source: string | null;
  minEpisodes: number | null;
  maxEpisodes: number | null;
};

export type NlSearchResult =
  | { ok: true; filters: ParsedNlFilters }
  | { ok: false; error: string };

const stripFences = (s: string) =>
  s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

export async function parseNaturalQuery(text: string): Promise<NlSearchResult> {
  const input = text.trim().slice(0, 300);
  if (input.length < 3) {
    return { ok: false, error: "Describe what you're looking for." };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI search isn't configured on this server." };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    // The rolling alias: pinned flash models keep getting their free-tier
    // quota zeroed on deprecation (1.5 → 2.0 → 2.5 all did), so track latest.
    model: "gemini-flash-latest",
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const prompt =
    `Convert this anime search request into filters. Request: "${input}"\n\n` +
    `Return strict JSON with these keys (null/omit what doesn't apply):\n` +
    `query (title words ONLY if a specific show is named), ` +
    `genres (from: ${GENRE_OPTIONS.map((g) => g.name).join(", ")}), ` +
    `tags (from: ${TAG_OPTIONS.join(", ")}), ` +
    `year, min_year, max_year, ` +
    `season (winter|spring|summer|fall), ` +
    `format (${FORMAT_OPTIONS.map((f) => f.value).join("|")}), ` +
    `status (${STATUS_OPTIONS.map((s) => s.value).join("|")}), ` +
    `streaming (${STREAMING_OPTIONS.join("|")}), ` +
    `country (${COUNTRY_OPTIONS.map((c) => c.value).join("|")}), ` +
    `source (${SOURCE_OPTIONS.map((s) => s.value).join("|")}), ` +
    `min_episodes, max_episodes.\n` +
    `Interpret mood words as genres/tags (e.g. "makes me cry" → Drama; ` +
    `"darker" → Psychological or Thriller). "Short" → max_episodes 13.`;

  let raw: z.infer<typeof RawSchema>;
  try {
    const result = await model.generateContent(prompt);
    raw = RawSchema.parse(JSON.parse(stripFences(result.response.text())));
  } catch (err) {
    console.error("[nl-search] Gemini parse failure:", err);
    return { ok: false, error: "Couldn't interpret that — try rephrasing." };
  }

  // Validate every value against the real option lists.
  const genreByName = new Map(GENRE_OPTIONS.map((g) => [g.name.toLowerCase(), g.id]));
  const tagSet = new Set<string>(TAG_OPTIONS);
  const formatSet = new Set<string>(FORMAT_OPTIONS.map((f) => f.value));
  const statusSet = new Set<string>(STATUS_OPTIONS.map((s) => s.value));
  const streamingSet = new Set<string>(STREAMING_OPTIONS);
  const countrySet = new Set<string>(COUNTRY_OPTIONS.map((c) => c.value));
  const sourceSet = new Set<string>(SOURCE_OPTIONS.map((s) => s.value));
  const seasonSet = new Set<string>(SEASONS);

  const yearOk = (y: number | null | undefined) =>
    y != null && y >= 1960 && y <= new Date().getFullYear() + 1 ? y : null;

  const filters: ParsedNlFilters = {
    query: raw.query?.trim() ?? "",
    genreIds: (raw.genres ?? [])
      .map((g) => genreByName.get(g.toLowerCase()))
      .filter((id): id is number => id != null),
    tags: (raw.tags ?? []).filter((t) => tagSet.has(t)),
    year: yearOk(raw.year),
    minYear: yearOk(raw.min_year),
    maxYear: yearOk(raw.max_year),
    season: raw.season && seasonSet.has(raw.season) ? raw.season : null,
    format: raw.format && formatSet.has(raw.format) ? raw.format : null,
    status: raw.status && statusSet.has(raw.status) ? raw.status : null,
    streaming:
      raw.streaming && streamingSet.has(raw.streaming) ? raw.streaming : null,
    country: raw.country && countrySet.has(raw.country) ? raw.country : null,
    source: raw.source && sourceSet.has(raw.source) ? raw.source : null,
    minEpisodes:
      raw.min_episodes != null && raw.min_episodes > 0 ? raw.min_episodes : null,
    maxEpisodes:
      raw.max_episodes != null && raw.max_episodes > 0 ? raw.max_episodes : null,
  };

  const hasAnything =
    filters.query.length >= 2 ||
    filters.genreIds.length > 0 ||
    filters.tags.length > 0 ||
    filters.year != null ||
    filters.minYear != null ||
    filters.maxYear != null ||
    filters.season != null ||
    filters.format != null ||
    filters.status != null ||
    filters.streaming != null ||
    filters.country != null ||
    filters.source != null ||
    filters.minEpisodes != null ||
    filters.maxEpisodes != null;
  if (!hasAnything) {
    return { ok: false, error: "Couldn't turn that into filters — try adding a genre, era, or vibe." };
  }

  return { ok: true, filters };
}

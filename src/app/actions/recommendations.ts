"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  grokJson,
  isGrokBillingIssue,
  isGrokConfigured,
  isGrokRateLimited,
} from "@/lib/grok";
import { searchAnime } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/** Enriched recommendation returned to the client (poster + resolved id). */
export type RecommendedAnime = {
  title: string;
  malId: number | null;
  reason: string;
  confidence: number | null;
  posterUrl: string | null;
  /** Community (MAL) score of the suggested title, if Jikan resolved it. */
  score: number | null;
};

export type GenerateRecommendationsResult =
  | { ok: true; recommendations: RecommendedAnime[] }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Grok response schema (lenient on field types — the model isn't reliable     */
/* about number-vs-string, so we coerce rather than force a needless retry).   */
/* -------------------------------------------------------------------------- */

const SuggestionSchema = z.object({
  title: z.string().min(1),
  mal_id_guess: z.union([z.number(), z.string()]).nullish(),
  reason: z.string().min(1),
  confidence: z.union([z.number(), z.string()]).nullish(),
});
/** Wrapped in an object because JSON mode cannot return a bare array. */
const SuggestionsSchema = z.object({
  suggestions: z.array(SuggestionSchema).min(1),
});

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Asks Grok for suggestions. The malformed-JSON retry lives in `grokJson`, so
 * this is only the prompt; transport and rate-limit failures propagate.
 */
async function getSuggestions(
  loved: { title: string; rating: number }[],
): Promise<z.infer<typeof SuggestionsSchema>["suggestions"]> {
  const { suggestions } = await grokJson({
    schema: SuggestionsSchema,
    // Variety is asked for explicitly because the failure mode of this feature
    // isn't a bad pick, it's five picks from one franchise or one genre.
    temperature: 0.9,
    system:
      `You recommend anime. Reply with a JSON object of the form ` +
      `{"suggestions": [{"title": string, "mal_id_guess": integer|null, ` +
      `"reason": string, "confidence": number between 0 and 1}]}. ` +
      `Use the exact romaji or English title as it appears on MyAnimeList, ` +
      `so it can be looked up. Give the reason in one sentence, addressed to ` +
      `the user.`,
    user:
      `Here are anime the user loved, with the score they gave each: ` +
      `${JSON.stringify(loved)}. Suggest exactly 5 anime they have not ` +
      `watched. Prioritise variety of genre and tone, and do not suggest ` +
      `sequels, prequels or spin-offs of anything in that list.`,
  });
  return suggestions;
}

/**
 * Generates 5 AI anime recommendations from the user's highly-rated completed
 * titles, resolves each to a real MAL id + poster via Jikan, persists them, and
 * returns the enriched list.
 *
 * Note: our `anime` catalog doesn't store genres, so the prompt is built from
 * `{title, rating}` (rating = the user's score). Add a genres column populated
 * at add-time if you want genre signal in the prompt.
 */
export async function generateRecommendations(): Promise<GenerateRecommendationsResult> {
  if (!isGrokConfigured()) {
    return { ok: false, error: "XAI_API_KEY is not configured." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "You must be signed in to get recommendations.",
    };
  }

  // 1. Favorites: completed with the user's score >= 7. The user_id filter is
  // required — migration 0015 made public profiles' progress readable, so
  // without it the prompt is built from strangers' taste, not theirs.
  const { data: favorites, error: favErr } = await supabase
    .from("user_progress")
    .select("score, anime:anime_id (title)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("score", 7)
    .order("score", { ascending: false })
    .limit(40);

  if (favErr) return { ok: false, error: favErr.message };
  if (!favorites || favorites.length === 0) {
    return {
      ok: false,
      error: "Rate a few completed anime 7 or higher first, then try again.",
    };
  }

  const loved = favorites.map((f) => ({
    title: f.anime.title,
    rating: f.score!,
  }));
  const watched = new Set(loved.map((l) => l.title.toLowerCase()));

  // 2. Ask Grok (with the malformed-JSON retry inside grokJson).
  let suggestions: z.infer<typeof SuggestionsSchema>["suggestions"];
  try {
    suggestions = await getSuggestions(loved);
  } catch (err) {
    if (isGrokBillingIssue(err)) {
      return {
        ok: false,
        error:
          "The xAI account has no credits — top it up at console.x.ai, then try again.",
      };
    }
    if (isGrokRateLimited(err)) {
      return {
        ok: false,
        error:
          "Recommendations are rate-limited right now — try again shortly.",
      };
    }
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return {
        ok: false,
        error: "The model returned an unreadable response. Please try again.",
      };
    }
    return { ok: false, error: "Couldn't generate recommendations right now." };
  }

  // 3. Resolve each to a real mal_id + poster via Jikan. Misses are skipped
  //    silently (keep the model's guess, no poster). Drop already-watched.
  const enriched: RecommendedAnime[] = [];
  for (const s of suggestions) {
    if (watched.has(s.title.toLowerCase())) continue;

    let malId = toNum(s.mal_id_guess);
    if (malId != null) malId = Math.trunc(malId);
    let posterUrl: string | null = null;
    let score: number | null = null;

    try {
      const hit = (await searchAnime(s.title)).data[0];
      if (hit) {
        malId = hit.mal_id;
        posterUrl =
          hit.images?.jpg?.large_image_url ??
          hit.images?.jpg?.image_url ??
          null;
        score = hit.score;
      }
    } catch {
      // Jikan miss / rate limit (JikanError) or any transient failure: keep the
      // model's guess, no poster, and move on without failing the batch.
    }

    enriched.push({
      title: s.title,
      malId,
      reason: s.reason,
      confidence: toNum(s.confidence),
      posterUrl,
      score,
    });
  }

  // 4. Persist the ones we could pin to a real id (the table keys on mal_id).
  const rows = enriched
    .filter((r) => r.malId != null)
    .map((r) => ({
      user_id: user.id,
      mal_id: r.malId!,
      reason: r.reason,
      title: r.title,
      poster_url: r.posterUrl,
      score: r.score,
      dismissed: false,
    }));

  if (rows.length > 0) {
    await supabase
      .from("recommendations")
      .upsert(rows, { onConflict: "user_id,mal_id", ignoreDuplicates: true });
  }

  revalidatePath("/recommendations");
  return { ok: true, recommendations: enriched };
}

export type DismissResult = { ok: true } | { ok: false; error: string };

/** Marks a recommendation dismissed for the current user (RLS-scoped). */
export async function dismissRecommendation(
  malId: number,
): Promise<DismissResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("recommendations")
    .update({ dismissed: true })
    .eq("mal_id", malId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/recommendations");
  return { ok: true };
}

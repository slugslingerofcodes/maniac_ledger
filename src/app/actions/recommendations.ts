"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
/* Gemini response schema (lenient on field types — the model isn't reliable   */
/* about number-vs-string, so we coerce rather than force a needless retry).   */
/* -------------------------------------------------------------------------- */

const SuggestionSchema = z.object({
  title: z.string().min(1),
  mal_id_guess: z.union([z.number(), z.string()]).nullish(),
  reason: z.string().min(1),
  confidence: z.union([z.number(), z.string()]).nullish(),
});
const SuggestionsSchema = z.array(SuggestionSchema).min(1);

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Calls Gemini and parses the suggestion array; retries once with a stricter
 *  prompt if the first response isn't valid JSON in our shape. Throws on a
 *  second failure or on a transport/rate-limit error. */
async function getSuggestions(
  apiKey: string,
  loved: { title: string; rating: number }[],
): Promise<z.infer<typeof SuggestionsSchema>> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    // Pinned flash models keep getting their free-tier quota zeroed on
    // deprecation (1.5 → 2.0 → 2.5 all did, each as a 429/404 in prod); the
    // rolling alias tracks whatever the current free-tier flash model is.
    model: "gemini-flash-latest",
    // Ask for raw JSON up front — the biggest lever against malformed output.
    generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
  });

  const basePrompt =
    `Based on these anime the user loved: ${JSON.stringify(loved)}, suggest 5 ` +
    `anime they haven't watched yet. Return strict JSON: ` +
    `[{title, mal_id_guess, reason, confidence}]. Prioritize variety in genre ` +
    `and avoid sequels of what they've already seen.`;

  const tryOnce = async (prompt: string) => {
    const result = await model.generateContent(prompt);
    return SuggestionsSchema.parse(JSON.parse(stripFences(result.response.text())));
  };

  try {
    return await tryOnce(basePrompt);
  } catch (err) {
    // A transport/rate-limit error should bubble up, not trigger the JSON
    // retry. Only retry when the failure was parsing/validation.
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      const stricter =
        basePrompt +
        ` Respond with ONLY a valid JSON array and nothing else — no markdown, ` +
        `no prose. "mal_id_guess" must be an integer or null; "confidence" must ` +
        `be a number between 0 and 1.`;
      return await tryOnce(stricter);
    }
    throw err;
  }
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to get recommendations." };
  }

  // 1. Favorites: completed with the user's score >= 7 (RLS scopes to them).
  const { data: favorites, error: favErr } = await supabase
    .from("user_progress")
    .select("score, anime:anime_id (title)")
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

  const loved = favorites.map((f) => ({ title: f.anime.title, rating: f.score! }));
  const watched = new Set(loved.map((l) => l.title.toLowerCase()));

  // 2. Ask Gemini (with the malformed-JSON retry inside getSuggestions).
  let suggestions: z.infer<typeof SuggestionsSchema>;
  try {
    suggestions = await getSuggestions(apiKey, loved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b429\b|rate|quota|exhausted/i.test(msg)) {
      return {
        ok: false,
        error: "Recommendations are rate-limited right now — try again shortly.",
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
          hit.images?.jpg?.large_image_url ?? hit.images?.jpg?.image_url ?? null;
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

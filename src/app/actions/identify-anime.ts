"use server";

import { z } from "zod";

import {
  grokJson,
  isGrokBillingIssue,
  isGrokConfigured,
  isGrokRateLimited,
} from "@/lib/grok";
import { searchAnime } from "@/lib/jikan";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/auth";

/**
 * "That one with the notebook and the detective" — identify an anime from a
 * half-remembered description.
 *
 * Deliberately not the same feature as `nl-search`'s NaturalSearchBox, which
 * turns a *specification* ("dark isekai under 25 episodes") into filters for
 * the catalogue search. This takes a bad *recollection* — wrong names, wrong
 * details, plot confused with another show — and asks for candidate titles.
 * Filters cannot do that: there is no facet for "the guy's hair turns white
 * near the end", and Jikan's title search fails outright on a query that
 * contains no part of the title.
 *
 * Everything the model returns is treated as a guess and resolved against
 * Jikan, so a hallucinated title simply produces no card rather than a link to
 * an anime that does not exist.
 */

/** JSON mode cannot return a bare array, so the list is wrapped. */
const CandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().min(1),
        /** Why the model thinks this matches what was described. */
        reason: z.string().min(1),
        confidence: z.union([z.number(), z.string()]).nullish(),
      }),
    )
    .max(8),
});

export type IdentifiedAnime = {
  title: string;
  malId: number | null;
  posterUrl: string | null;
  score: number | null;
  reason: string;
  confidence: number | null;
};

export type IdentifyAnimeResult =
  { ok: true; candidates: IdentifiedAnime[] } | { ok: false; error: string };

/**
 * Per-user ceiling. Every call is a billable Grok request followed by up to
 * five Jikan lookups, and this box invites retrying with a reworded guess —
 * exactly the shape of usage that runs up a bill without anyone noticing.
 */
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function identifyAnime(
  description: string,
): Promise<IdentifyAnimeResult> {
  const user = await requireUser();

  const text = description.trim();
  if (text.length < 8) {
    return {
      ok: false,
      error: "Give it a bit more to go on — a scene, a character, anything.",
    };
  }
  // Long enough to describe a plot, short enough not to be a pasted essay.
  if (text.length > 600) {
    return {
      ok: false,
      error: "That's a lot to go on — try trimming it down.",
    };
  }

  if (!isGrokConfigured()) {
    return { ok: false, error: "XAI_API_KEY is not configured." };
  }

  const verdict = checkRateLimit(`identify-anime:${user.id}`, LIMIT, WINDOW_MS);
  if (!verdict.ok) {
    return {
      ok: false,
      error: "You've used up this hour's searches — try again later.",
    };
  }

  let candidates: z.infer<typeof CandidatesSchema>["candidates"];
  try {
    ({ candidates } = await grokJson({
      schema: CandidatesSchema,
      // Low temperature: this is recall, not invention. A creative answer here
      // is a wrong answer.
      temperature: 0.2,
      system:
        `You identify anime from vague, partial or mistaken descriptions. The ` +
        `user may misremember names, mix up plot points, or describe only one ` +
        `scene. Infer what they most likely mean. Reply with a JSON object of ` +
        `the form {"candidates": [{"title": string, "reason": string, ` +
        `"confidence": number between 0 and 1}]}, ordered most likely first, ` +
        `at most 5 entries. Use the exact romaji or English title as it ` +
        `appears on MyAnimeList so it can be looked up. In "reason", say in ` +
        `one sentence which part of their description matches. If nothing ` +
        `plausibly matches, return {"candidates": []} rather than guessing.`,
      user: `Which anime is this? ${text}`,
    }));
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
        error: "Search is busy right now — try again shortly.",
      };
    }
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return {
        ok: false,
        error: "The model returned an unreadable response. Please try again.",
      };
    }
    return { ok: false, error: "Couldn't run that search right now." };
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        "No match for that one. Try adding a detail — a character, an ending, a setting.",
    };
  }

  // Resolve each guess against Jikan. A title that resolves to nothing is
  // dropped entirely: an unresolvable card is a dead end for the user, and the
  // model inventing a plausible-sounding title is the expected failure here.
  const resolved: IdentifiedAnime[] = [];
  for (const c of candidates.slice(0, 5)) {
    try {
      const hit = (await searchAnime(c.title)).data[0];
      if (!hit) continue;
      resolved.push({
        title: hit.title_english ?? hit.title,
        malId: hit.mal_id,
        posterUrl:
          hit.images?.jpg?.large_image_url ??
          hit.images?.jpg?.image_url ??
          null,
        score: hit.score,
        reason: c.reason,
        confidence: toNum(c.confidence),
      });
    } catch {
      // Jikan miss or rate limit — skip this candidate rather than fail the
      // batch, so one bad lookup doesn't lose the other four.
    }
  }

  if (resolved.length === 0) {
    return {
      ok: false,
      error:
        "Found some guesses but couldn't match them to real titles. Try rewording it.",
    };
  }

  return { ok: true, candidates: resolved };
}

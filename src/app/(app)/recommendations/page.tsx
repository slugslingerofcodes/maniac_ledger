import type { Metadata } from "next";

import {
  RecommendationsView,
} from "@/components/anime/RecommendationsView";
import type { RecItem } from "@/components/anime/RecommendationCard";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Recommendations · anime_maniacs",
  description: "AI picks based on the anime you've loved.",
};

export default async function RecommendationsPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select("mal_id, title, poster_url, score, reason, generated_at")
    .eq("dismissed", false)
    .order("generated_at", { ascending: false })
    .limit(5);

  const items: RecItem[] = (data ?? []).map((r) => ({
    malId: r.mal_id,
    title: r.title ?? "Untitled",
    posterUrl: r.poster_url,
    score: r.score,
    reason: r.reason,
  }));

  // Newest generated_at gates the weekly refresh; null → never generated yet.
  const lastGeneratedAt = data?.[0]?.generated_at ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <RecommendationsView initial={items} lastGeneratedAt={lastGeneratedAt} />
    </main>
  );
}

import { notFound, redirect } from "next/navigation";

import { resolveAnimeIdByMalId } from "@/lib/library";
import { requireUser } from "@/lib/supabase/auth";

/**
 * Opens an anime by its MyAnimeList id (e.g. a search result, which has no
 * catalog uuid yet). Ensures the shared catalog row exists, then redirects to
 * the real `/anime/[id]` detail page. Keeps the detail page uuid-only while
 * letting Jikan-sourced links resolve.
 */
export default async function AnimeByMalIdPage({
  params,
}: {
  params: Promise<{ malId: string }>;
}) {
  // Protected route + the catalog upsert needs a session (INSERT policy).
  await requireUser();

  const { malId } = await params;
  const id = Number(malId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let animeId: string;
  try {
    animeId = await resolveAnimeIdByMalId(id);
  } catch {
    // Unknown MAL id or Jikan failure — nothing to show.
    notFound();
  }

  redirect(`/anime/${animeId}`);
}

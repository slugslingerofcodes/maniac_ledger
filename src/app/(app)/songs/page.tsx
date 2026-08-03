import type { Metadata } from "next";
import { Suspense } from "react";

import { SongsClient } from "@/components/songs/SongsClient";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Songs · anime_maniacs" };

/**
 * Anime music player: search any anime and stream its openings/endings from
 * the AnimeThemes.moe community archive. All the interactivity lives in
 * SongsClient (it reads the ?mal= deep link, hence the Suspense boundary).
 */
export default async function SongsPage() {
  // Defence in depth: the proxy already redirects signed-out visitors, but a
  // middleware bypass (Next has shipped advisories for exactly that) would
  // otherwise leave this page rendering. The server guard is the real gate.
  await requireUser();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-gradient text-2xl font-semibold tracking-tight">
        Anime Music
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Openings and endings, streamed from the AnimeThemes.moe community
        archive.
      </p>
      <Suspense fallback={null}>
        <SongsClient />
      </Suspense>
    </main>
  );
}

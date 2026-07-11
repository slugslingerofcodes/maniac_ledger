import type { Metadata } from "next";

import { requireUser } from "@/lib/supabase/auth";

import { MoviesClient } from "./movies-client";

export const metadata: Metadata = {
  title: "Movies · anime_maniacs",
  description: "Browse anime movies by genre, ranked by popularity.",
};

export default async function MoviesPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Anime Movies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The most popular anime films — filter by genre, page through the
          whole catalog.
        </p>
      </div>
      <MoviesClient />
    </main>
  );
}

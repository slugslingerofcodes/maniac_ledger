import type { Metadata } from "next";

import { requireUser } from "@/lib/supabase/auth";

import { SeasonsClient } from "./seasons-client";

export const metadata: Metadata = {
  title: "Seasons · anime_maniacs",
  description: "Browse anime season by season, back to 1960.",
};

export default async function SeasonsPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seasonal Charts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything that premiered in a season, ranked by popularity.
        </p>
      </div>
      <SeasonsClient />
    </main>
  );
}

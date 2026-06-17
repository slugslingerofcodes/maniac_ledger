import { SiteHeader } from "@/components/site-header";

import { SearchClient } from "./search-client";

export default function SearchPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Search anime</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find anime on MyAnimeList and add them to your library.
        </p>
        <SearchClient />
      </main>
    </div>
  );
}

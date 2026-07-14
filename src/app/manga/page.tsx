import Link from "next/link";
import { Search } from "lucide-react";

import { MangaLibraryGridClient } from "@/components/manga/MangaLibraryGridClient";
import { MangaPosterCard } from "@/components/manga/MangaPosterCard";
import { SourceNotice } from "@/components/SourceNotice";
import { searchAnilistManga } from "@/lib/anilist";
import { getTopManga, type JikanManga } from "@/lib/jikan";
import { topMangaCatalog } from "@/lib/manga-catalog-fallback";

// Per-user (your manga) + live Jikan data — never prerender at build time.
export const dynamic = "force-dynamic";

const dedupe = (list: JikanManga[]) => {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = m.mal_id != null ? `mal:${m.mal_id}` : `md:${m.mangadex_id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Popular manga: MAL → AniList (popularity browse) → local catalog. */
async function PopularManga() {
  let list: JikanManga[] = [];
  let degraded = false;
  try {
    list = dedupe((await getTopManga(18)).data);
  } catch {
    try {
      list = dedupe((await searchAnilistManga("", 1)).data).slice(0, 18);
    } catch {
      // Both live APIs down → best-scored titles from the backup catalog.
      try {
        list = await topMangaCatalog(18);
        degraded = true;
      } catch {
        return null;
      }
    }
  }
  if (list.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-gradient mb-4 text-lg font-semibold tracking-tight">
        Popular manga
      </h2>
      {degraded ? <SourceNotice source="catalog" degraded /> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((manga) => (
          <MangaPosterCard key={manga.mal_id ?? manga.mangadex_id} manga={manga} />
        ))}
      </div>
    </section>
  );
}

export default function MangaHome() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-border bg-card/60 p-6 sm:p-8">
        <h1 className="text-gradient text-3xl font-bold tracking-tight sm:text-4xl">
          Track the manga you read.
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Search MyAnimeList, build your reading list, and keep tabs on chapters
          and volumes — the manga side of anime_maniacs.
        </p>
        <Link
          href="/manga/search"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Search className="size-4" aria-hidden />
          Search manga
        </Link>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-gradient text-lg font-semibold tracking-tight">
            Your manga
          </h2>
          <Link
            href="/manga/library"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        <MangaLibraryGridClient filter="all" limit={10} />
      </section>

      <PopularManga />
    </main>
  );
}

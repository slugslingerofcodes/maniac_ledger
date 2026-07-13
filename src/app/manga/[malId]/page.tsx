import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MangaReadingTracker } from "@/components/manga/MangaReadingTracker";
import { SourceNotice } from "@/components/SourceNotice";
import { Badge } from "@/components/ui/badge";
import { getAnilistMangaByMalId } from "@/lib/anilist";
import { getMangaById, type JikanManga } from "@/lib/jikan";
import {
  catalogMangaByMalId,
  toJikanMangaShape,
} from "@/lib/manga-catalog-fallback";
import { upsertCatalogManga } from "@/lib/manga";
import { createClient } from "@/lib/supabase/server";
import type { ReadingStatus } from "@/types/manga";

export const dynamic = "force-dynamic";

function coverOf(m: JikanManga): string | null {
  return m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null;
}

export default async function MangaDetailPage(props: {
  params: Promise<{ malId: string }>;
}) {
  const { malId: malIdRaw } = await props.params;
  const malId = Number(malIdRaw);
  if (!Number.isFinite(malId) || malId <= 0) notFound();

  // Live-first: fetch from Jikan and catalog it (idempotent) so progress can
  // reference its uuid. When MAL is down, re-fetch from AniList by MAL id —
  // still a full record, so it's cataloged and tracking works normally. Only
  // when both live APIs fail does the local catalog row serve the page.
  const supabase = await createClient();
  let manga: JikanManga | null = null;
  let mangaId: string | null = null;
  let source: "mal" | "anilist" | "catalog" = "mal";
  try {
    manga = await getMangaById(malId);
    mangaId = await upsertCatalogManga(supabase, manga);
  } catch {
    try {
      const fromAnilist = await getAnilistMangaByMalId(malId);
      if (fromAnilist) {
        manga = fromAnilist;
        mangaId = await upsertCatalogManga(supabase, fromAnilist);
        source = "anilist";
      }
    } catch {
      /* fall through to the local catalog */
    }
    if (!manga || !mangaId) {
      const row = await catalogMangaByMalId(malId);
      if (row) {
        manga = toJikanMangaShape(row);
        mangaId = row.id;
        source = "catalog";
      }
    }
  }

  if (!manga || !mangaId) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          This manga couldn&apos;t be loaded right now. Please try again later.
        </p>
        <Link
          href="/manga/search"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          ← Back to search
        </Link>
      </main>
    );
  }

  // The current user's progress (RLS-scoped to them).
  const { data: progress } = await supabase
    .from("manga_progress")
    .select("status, chapters_read, volumes_read, score")
    .eq("manga_id", mangaId)
    .maybeSingle();

  const cover = coverOf(manga);
  const title = manga.title_english ?? manga.title;
  const authors = (manga.authors ?? []).map((a) => a.name);

  const meta: string[] = [
    manga.type ?? null,
    manga.status ?? null,
    manga.chapters != null ? `${manga.chapters} ch` : null,
    manga.volumes != null ? `${manga.volumes} vol` : null,
    manga.score != null ? `★ ${manga.score}` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/manga/search"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Search
      </Link>

      <SourceNotice source={source} anilistLabel="Details via AniList" />

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Cover + tracker column */}
        <div className="flex flex-col gap-4">
          <div className="relative mx-auto aspect-[2/3] w-48 overflow-hidden rounded-xl bg-muted ring-1 ring-border md:w-full">
            {cover ? (
              <Image
                src={cover}
                alt={title}
                fill
                priority
                sizes="220px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No cover
              </div>
            )}
          </div>
          <MangaReadingTracker
            mangaId={mangaId}
            inLibrary={progress != null}
            totalChapters={manga.chapters}
            totalVolumes={manga.volumes}
            initialStatus={(progress?.status as ReadingStatus) ?? "plan_to_read"}
            initialChapters={progress?.chapters_read ?? 0}
            initialVolumes={progress?.volumes_read ?? 0}
            initialScore={progress?.score ?? null}
          />
        </div>

        {/* Info column */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {manga.title_english && manga.title_english !== manga.title ? (
            <p className="mt-1 text-sm text-muted-foreground">{manga.title}</p>
          ) : null}
          {authors.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              by {authors.join(", ")}
            </p>
          ) : null}

          {meta.length > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {meta.join(" · ")}
            </p>
          ) : null}

          {manga.genres.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {manga.genres.map((g) => (
                <Badge key={g.mal_id} variant="outline">
                  {g.name}
                </Badge>
              ))}
            </div>
          ) : null}

          {manga.synopsis ? (
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {manga.synopsis}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

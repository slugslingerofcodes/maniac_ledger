import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { MangaChapterList } from "@/components/manga/MangaChapterList";
import { MangaReadingTracker } from "@/components/manga/MangaReadingTracker";
import { PosterLightbox } from "@/components/PosterLightbox";
import { Badge } from "@/components/ui/badge";
import {
  ensureMangaChapters,
  getStoredChapters,
} from "@/lib/manga-chapters";
import { getMangaDexMangaDetail } from "@/lib/mangadex";
import { upsertCatalogManga } from "@/lib/manga";
import { createClient } from "@/lib/supabase/server";
import type { ReadingStatus } from "@/types/manga";

export const dynamic = "force-dynamic";

const MD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detail page for MangaDex-only titles — manga with no MyAnimeList entry, so
 * they can't use the MAL-keyed /manga/[malId] route. Cataloged by
 * `mangadex_id` (migration 0025) and tracked like any other manga. Records
 * that turn out to carry a MAL link redirect to the canonical page.
 */
export default async function MangaDexDetailPage(props: {
  params: Promise<{ mdId: string }>;
}) {
  const { mdId } = await props.params;
  if (!MD_UUID_RE.test(mdId)) notFound();

  let manga;
  try {
    manga = await getMangaDexMangaDetail(mdId);
  } catch {
    manga = null;
  }
  if (!manga) {
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

  // MAL-linked after all → the MAL-keyed page is canonical.
  if (manga.mal_id != null) redirect(`/manga/${manga.mal_id}`);

  const supabase = await createClient();
  const mangaId = await upsertCatalogManga(supabase, manga);

  const { data: progress } = await supabase
    .from("manga_progress")
    .select("status, chapters_read, volumes_read, score")
    .eq("manga_id", mangaId)
    .maybeSingle();

  // Chapters: the MangaDex id is already known, so no resolution step.
  const { data: syncMeta } = await supabase
    .from("manga")
    .select("chapters_synced_at")
    .eq("id", mangaId)
    .maybeSingle();
  const syncArgs = {
    id: mangaId,
    mal_id: null,
    title: manga.title,
    title_english: manga.title_english,
    status: manga.status,
    type: manga.type,
    chapters: manga.chapters,
    mangadex_id: mdId,
    chapters_synced_at: syncMeta?.chapters_synced_at ?? null,
  };
  let chapterRows = await getStoredChapters(mangaId);
  if (chapterRows.length === 0) {
    await ensureMangaChapters(syncArgs);
    chapterRows = await getStoredChapters(mangaId);
  } else {
    after(() => ensureMangaChapters(syncArgs));
  }

  const cover =
    manga.images?.jpg?.large_image_url ?? manga.images?.jpg?.image_url ?? null;
  const title = manga.title_english ?? manga.title;
  const authors = (manga.authors ?? []).map((a) => a.name);
  const meta: string[] = [
    manga.type ?? null,
    manga.status ?? null,
    manga.chapters != null ? `${manga.chapters} ch` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/manga/search"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Search
      </Link>

      <p className="mb-4 text-center text-[11px] text-muted-foreground">
        Details via MangaDex — this title has no MyAnimeList entry.
      </p>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {cover ? (
            <PosterLightbox src={cover} alt={title}>
              <div className="relative mx-auto aspect-[2/3] w-48 overflow-hidden rounded-xl bg-muted ring-1 ring-border md:w-full">
                <Image
                  src={cover}
                  alt={title}
                  fill
                  priority
                  sizes="220px"
                  className="object-cover"
                />
              </div>
            </PosterLightbox>
          ) : (
            <div className="relative mx-auto flex aspect-[2/3] w-48 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground ring-1 ring-border md:w-full">
              No cover
            </div>
          )}
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
                <Badge key={g.name} variant="outline">
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

          <MangaChapterList
            chapters={chapterRows.map((c) => ({
              number: Number(c.number),
              title: c.title,
              publishedAt: c.published_at,
            }))}
            chaptersRead={progress?.chapters_read ?? 0}
          />
        </div>
      </div>
    </main>
  );
}

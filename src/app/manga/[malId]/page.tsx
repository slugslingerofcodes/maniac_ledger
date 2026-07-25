import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { MangaChapterList } from "@/components/manga/MangaChapterList";
import { MangaReadingTracker } from "@/components/manga/MangaReadingTracker";
import { PosterLightbox } from "@/components/PosterLightbox";
import { SourceNotice } from "@/components/SourceNotice";
import { Badge } from "@/components/ui/badge";
import { getAnilistMangaByMalId } from "@/lib/anilist";
import { getMangaById, type JikanManga } from "@/lib/jikan";
import {
  ensureMangaChapters,
  getStoredChapters,
} from "@/lib/manga-chapters";
import {
  catalogMangaByMalId,
  toJikanMangaShape,
} from "@/lib/manga-catalog-fallback";
import { getMangaDexMangaDetail } from "@/lib/mangadex";
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
  let source: "mal" | "anilist" | "mangadex" | "catalog" = "mal";
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
        // The catalog row renders the page; when it carries a MangaDex link,
        // prefer live MangaDex details (fuller synopsis, fresher status) —
        // the third live source correcting sparse rows during MAL outages.
        manga = toJikanMangaShape(row);
        mangaId = row.id;
        source = "catalog";
        if (row.mangadex_id) {
          try {
            const fromMd = await getMangaDexMangaDetail(row.mangadex_id);
            if (fromMd) {
              // Keep the row's identity/counts; take MangaDex's richer text.
              manga = {
                ...manga,
                synopsis: fromMd.synopsis ?? manga.synopsis,
                status: fromMd.status ?? manga.status,
                genres: manga.genres.length > 0 ? manga.genres : fromMd.genres,
                authors: manga.authors?.length ? manga.authors : fromMd.authors,
              };
              source = "mangadex";
            }
          } catch {
            /* keep the catalog row */
          }
        }
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

  // Chapter list: lazily synced from MangaDex, read from the shared catalog.
  // Stored rows render immediately with the re-sync deferred until after the
  // response (`after()`, same pattern as franchise resolution) — only a manga
  // with no rows yet blocks on the sync, so its first view isn't empty.
  // Best-effort throughout: the page renders without chapters if all fails.
  const { data: syncMeta } = await supabase
    .from("manga")
    .select("mangadex_id, chapters_synced_at")
    .eq("id", mangaId)
    .maybeSingle();
  const isNovel = (manga.type ?? "").toLowerCase().includes("novel");
  const syncArgs = {
    id: mangaId,
    mal_id: manga.mal_id,
    title: manga.title,
    title_english: manga.title_english,
    status: manga.status,
    type: manga.type,
    chapters: manga.chapters,
    mangadex_id: syncMeta?.mangadex_id ?? null,
    chapters_synced_at: syncMeta?.chapters_synced_at ?? null,
  };
  let chapterRows = await getStoredChapters(mangaId);
  if (chapterRows.length === 0 && !isNovel) {
    await ensureMangaChapters(syncArgs);
    chapterRows = await getStoredChapters(mangaId);
  } else if (!isNovel) {
    after(() => ensureMangaChapters(syncArgs));
  }

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
          {cover ? (
            // Click-to-zoom: opens the full cover in a lightbox.
            <PosterLightbox src={cover} alt={title}>
              <div className="relative mx-auto aspect-[2/3] w-48 overflow-hidden rounded-xl bg-muted ring-1 ring-border md:w-full">
                <Image
                  src={cover}
                  alt={title}
                  fill
                  priority
                  referrerPolicy="no-referrer"
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

          {/* Chapters from the MangaDex-synced catalog; light novels have no
              chapter source, so they show a volume list with read ticks. */}
          {isNovel ? (
            <MangaChapterList
              unit="volume"
              chapters={Array.from(
                { length: manga.volumes ?? 0 },
                (_, i) => ({
                  number: i + 1,
                  title: `Volume ${i + 1}`,
                  publishedAt: null,
                }),
              )}
              chaptersRead={progress?.volumes_read ?? 0}
            />
          ) : (
            <MangaChapterList
              chapters={chapterRows.map((c) => ({
                // numeric column — some drivers serialize it as a string.
                number: Number(c.number),
                title: c.title,
                publishedAt: c.published_at,
              }))}
              chaptersRead={progress?.chapters_read ?? 0}
            />
          )}
        </div>
      </div>
    </main>
  );
}

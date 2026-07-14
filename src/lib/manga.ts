import { getMangaById, type JikanManga } from "@/lib/jikan";
import { createClient } from "@/lib/supabase/server";

/** The request-scoped Supabase server client (RLS runs as the signed-in user). */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AddToMangaLibraryResult =
  | { success: true; mangaId: string }
  | { alreadyAdded: true; mangaId: string };

function coverOf(manga: JikanManga): string | null {
  return (
    manga.images?.jpg?.large_image_url ?? manga.images?.jpg?.image_url ?? null
  );
}

/** Publication start year, parsed from the ISO `published.from` date. */
function yearOf(manga: JikanManga): number | null {
  const from = manga.published?.from;
  if (!from) return null;
  const y = new Date(from).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

/**
 * Upserts the shared catalog row for a manga and returns its catalog uuid.
 * MAL-linked records dedupe on `mal_id` (refreshing metadata on repeat);
 * MangaDex-only records (no MAL entry) key on `mangadex_id` instead — those
 * need migration 0025's unique constraint. Mirrors `upsertCatalogAnime`.
 * Falls back to reading the existing row's id if the conflict-update is
 * RLS-denied.
 */
export async function upsertCatalogManga(
  supabase: ServerClient,
  manga: JikanManga,
): Promise<string> {
  // MangaDex-only path: no mal_id to conflict on — find-or-insert by uuid.
  if (manga.mal_id == null) {
    if (!manga.mangadex_id) {
      throw new Error("Manga record has neither a MAL nor a MangaDex id.");
    }
    const { data: existing } = await supabase
      .from("manga")
      .select("id")
      .eq("mangadex_id", manga.mangadex_id)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: inserted, error: insErr } = await supabase
      .from("manga")
      .insert({
        mal_id: null,
        mangadex_id: manga.mangadex_id,
        title: manga.title,
        title_english: manga.title_english,
        synopsis: manga.synopsis,
        cover_url: coverOf(manga),
        score: manga.score,
        status: manga.status ?? null,
        type: manga.type ?? null,
        chapters: manga.chapters,
        volumes: manga.volumes,
        year: yearOf(manga),
        authors: (manga.authors ?? []).map((a) => a.name),
        genres: (manga.genres ?? []).map((g) => g.name),
      })
      .select("id")
      .single();
    if (inserted) return inserted.id;
    // Unique-violation race (another request inserted first) → re-read.
    const { data: raced } = await supabase
      .from("manga")
      .select("id")
      .eq("mangadex_id", manga.mangadex_id)
      .maybeSingle();
    if (raced) return raced.id;
    throw new Error(insErr?.message ?? "Could not save this manga to the catalog.");
  }

  const row = {
    mal_id: manga.mal_id,
    title: manga.title,
    title_english: manga.title_english,
    synopsis: manga.synopsis,
    cover_url: coverOf(manga),
    score: manga.score,
    status: manga.status ?? null,
    type: manga.type ?? null,
    chapters: manga.chapters,
    volumes: manga.volumes,
    year: yearOf(manga),
    authors: (manga.authors ?? []).map((a) => a.name),
    genres: (manga.genres ?? []).map((g) => g.name),
  };

  let { data, error } = await supabase
    .from("manga")
    .upsert(row, { onConflict: "mal_id" })
    .select("id")
    .single();

  // Table created from the earlier 0022 draft (no `type` column) → retry
  // without it so adds keep working; re-running the migration adds the column.
  if (error && /'type' column|column "type"/i.test(error.message)) {
    const { type: _type, ...withoutType } = row;
    ({ data, error } = await supabase
      .from("manga")
      .upsert(withoutType, { onConflict: "mal_id" })
      .select("id")
      .single());
  }

  // Row already cataloged and the UPDATE path is RLS-denied → just read its id.
  if (error && /row-level security/i.test(error.message)) {
    const { data: existing } = await supabase
      .from("manga")
      .select("id")
      .eq("mal_id", manga.mal_id)
      .maybeSingle();
    if (existing) return existing.id;
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save this manga to the catalog.");
  }
  return data.id;
}

/**
 * Resolves a MyAnimeList manga id to a catalog uuid, backfilling from Jikan if
 * it isn't cataloged yet. Used by the `/manga/[malId]` detail page.
 */
export async function resolveMangaIdByMalId(malId: number): Promise<string> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("manga")
    .select("id")
    .eq("mal_id", malId)
    .maybeSingle();
  if (existing) return existing.id;

  const manga = await getMangaById(malId);
  return upsertCatalogManga(supabase, manga);
}

/**
 * Adds a manga (from a Jikan record) to the signed-in user's manga library:
 * upserts the catalog row, then inserts a `manga_progress` row (status
 * 'plan_to_read'). Returns `{ alreadyAdded: true }` if already tracked. RLS runs
 * as the signed-in user.
 */
export async function addToMangaLibrary(
  manga: JikanManga,
): Promise<AddToMangaLibraryResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("You must be signed in to add manga to your library.");
  }

  const mangaId = await upsertCatalogManga(supabase, manga);

  const { error: progressError } = await supabase.from("manga_progress").insert({
    user_id: user.id,
    manga_id: mangaId,
    status: "plan_to_read",
    chapters_read: 0,
  });

  if (progressError) {
    // 23505 = unique (user_id, manga_id) violation → already in their library.
    if (progressError.code === "23505") {
      return { alreadyAdded: true, mangaId };
    }
    throw new Error(progressError.message);
  }

  return { success: true, mangaId };
}

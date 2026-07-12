import Link from "next/link";
import { notFound } from "next/navigation";

import { ListItemsGrid } from "@/components/lists/ListItemsGrid";
import { ListOwnerBar } from "@/components/lists/ListControls";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = {
  anime_id: string;
  position: number;
  anime: {
    id: string;
    title: string;
    title_english: string | null;
    poster_url: string | null;
    type: string | null;
    score: number | null;
  } | null;
};

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const user = await requireUser();
  const supabase = await createClient();

  // RLS returns the list only when it's the viewer's own or public.
  const { data: list } = await supabase
    .from("lists")
    .select("id, user_id, name, description, is_public")
    .eq("id", id)
    .maybeSingle();
  if (!list) notFound();

  const { data: items } = await supabase
    .from("list_items")
    .select(
      "anime_id, position, anime:anime_id (id, title, title_english, poster_url, type, score)",
    )
    .eq("list_id", id)
    .order("position", { ascending: true });

  const isOwner = list.user_id === user.id;
  const rows = (items ?? []) as ItemRow[];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/lists"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← All lists
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} anime · {list.is_public ? "public" : "private"}
            {list.description ? ` — ${list.description}` : ""}
          </p>
        </div>
        {isOwner ? (
          <ListOwnerBar listId={list.id} isPublic={list.is_public} />
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing here yet — open any anime and use &ldquo;Add to list&rdquo;.
        </p>
      ) : (
        <ListItemsGrid
          listId={list.id}
          isOwner={isOwner}
          items={rows
            .filter((item) => item.anime)
            .map((item) => ({
              animeId: item.anime_id,
              animeUuid: item.anime!.id,
              title: item.anime!.title,
              titleEnglish: item.anime!.title_english,
              posterUrl: item.anime!.poster_url,
            }))}
        />
      )}
    </main>
  );
}

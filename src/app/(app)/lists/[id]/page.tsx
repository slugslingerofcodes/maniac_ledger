import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ListOwnerBar,
  RemoveFromListButton,
} from "@/components/lists/ListControls";
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
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((item) =>
            item.anime ? (
              <div key={item.anime_id} className="group relative">
                {isOwner ? (
                  <RemoveFromListButton listId={list.id} animeId={item.anime_id} />
                ) : null}
                <Link
                  href={`/anime/${item.anime.id}`}
                  className="flex flex-col gap-2"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-primary/40">
                    {item.anime.poster_url ? (
                      <Image
                        src={item.anime.poster_url}
                        alt={item.anime.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                    {item.anime.title_english ?? item.anime.title}
                  </p>
                </Link>
              </div>
            ) : null,
          )}
        </div>
      )}
    </main>
  );
}

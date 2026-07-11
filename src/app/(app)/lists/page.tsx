import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GlobeIcon, LockIcon } from "lucide-react";

import { CreateListForm } from "@/components/lists/CreateListForm";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Lists · anime_maniacs",
  description: "Your custom anime collections.",
};

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  list_items: { anime: { poster_url: string | null } | null }[];
};

export default async function ListsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lists")
    .select("id, name, description, is_public, list_items (anime:anime_id (poster_url))")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated collections — &ldquo;comfort shows&rdquo;, &ldquo;best
            OPs&rdquo;, whatever you like. Public lists can be shared by URL.
          </p>
        </div>
        <CreateListForm />
      </div>

      {error ? (
        <p className="mt-8 text-sm text-destructive">
          Couldn&apos;t load lists
          {/(relation|does not exist|schema cache|could not find the table)/i.test(
            error.message,
          )
            ? " — the lists migration (0016) hasn't been applied to the database yet."
            : ". Please try again."}
        </p>
      ) : (data ?? []).length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No lists yet — create one, then add anime from any detail page.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(data as ListRow[]).map((list) => {
            const posters = (list.list_items ?? [])
              .map((i) => i.anime?.poster_url)
              .filter((p): p is string => Boolean(p))
              .slice(0, 4);
            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                className="group rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:text-primary">
                      {list.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {list.list_items?.length ?? 0}{" "}
                      {(list.list_items?.length ?? 0) === 1 ? "anime" : "anime"} ·{" "}
                      {list.is_public ? "public" : "private"}
                    </p>
                  </div>
                  {list.is_public ? (
                    <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <LockIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                </div>
                {list.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {list.description}
                  </p>
                ) : null}
                {posters.length > 0 ? (
                  <div className="mt-3 flex gap-1.5">
                    {posters.map((p, i) => (
                      <div
                        key={i}
                        className="relative aspect-[2/3] w-14 overflow-hidden rounded bg-muted"
                      >
                        <Image src={p} alt="" fill sizes="56px" className="object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

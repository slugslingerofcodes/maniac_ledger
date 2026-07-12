import type { Metadata } from "next";

import { CreateListForm } from "@/components/lists/CreateListForm";
import { ListsGrid, type ListCard } from "@/components/lists/ListsGrid";
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
        <ListsGrid
          lists={(data as ListRow[]).map<ListCard>((list) => ({
            id: list.id,
            name: list.name,
            description: list.description,
            is_public: list.is_public,
            itemCount: list.list_items?.length ?? 0,
            posters: (list.list_items ?? [])
              .map((i) => i.anime?.poster_url)
              .filter((p): p is string => Boolean(p))
              .slice(0, 4),
          }))}
        />
      )}
    </main>
  );
}

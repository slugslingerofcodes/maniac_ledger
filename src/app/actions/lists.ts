"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Custom lists (migration 0016). RLS enforces ownership on every write and
 * limits reads to own-or-public lists, so no user filters are needed here.
 */

export type ListActionResult =
  | { ok: true; listId?: string }
  | { ok: false; error: string };

export type MyListSummary = {
  id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
  /** Set when the caller passes animeId: is that anime already in this list? */
  hasAnime?: boolean;
};

const NAME = z.string().trim().min(1).max(80);
const UUID = z.string().uuid();

export async function createList(
  name: string,
  description?: string,
): Promise<ListActionResult> {
  const parsedName = NAME.safeParse(name);
  if (!parsedName.success) return { ok: false, error: "Give the list a name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to create lists." };

  const { data, error } = await supabase
    .from("lists")
    .insert({
      user_id: user.id,
      name: parsedName.data,
      description: description?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/lists");
  return { ok: true, listId: data.id };
}

export async function deleteList(listId: string): Promise<ListActionResult> {
  if (!UUID.safeParse(listId).success) return { ok: false, error: "Bad list id." };
  const supabase = await createClient();
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/lists");
  return { ok: true };
}

export async function setListPublic(
  listId: string,
  isPublic: boolean,
): Promise<ListActionResult> {
  if (!UUID.safeParse(listId).success) return { ok: false, error: "Bad list id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lists")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}

export async function addToList(
  listId: string,
  animeId: string,
): Promise<ListActionResult> {
  if (!UUID.safeParse(listId).success || !UUID.safeParse(animeId).success) {
    return { ok: false, error: "Bad id." };
  }
  const supabase = await createClient();

  // Append at the end: next position = current max + 1.
  const { data: last } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("list_items").upsert(
    {
      list_id: listId,
      anime_id: animeId,
      position: (last?.position ?? -1) + 1,
    },
    { onConflict: "list_id,anime_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { ok: true };
}

export async function removeFromList(
  listId: string,
  animeId: string,
): Promise<ListActionResult> {
  if (!UUID.safeParse(listId).success || !UUID.safeParse(animeId).success) {
    return { ok: false, error: "Bad id." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("anime_id", animeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
  return { ok: true };
}

/**
 * The caller's own lists, for the add-to-list menu. When `animeId` is given,
 * each summary carries whether that anime is already in the list.
 */
export async function getMyLists(animeId?: string): Promise<MyListSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("lists")
    .select("id, name, is_public, list_items (anime_id)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];

  return data.map((l) => ({
    id: l.id,
    name: l.name,
    isPublic: l.is_public,
    itemCount: l.list_items?.length ?? 0,
    ...(animeId
      ? { hasAnime: (l.list_items ?? []).some((i) => i.anime_id === animeId) }
      : {}),
  }));
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Store: user-facing reads + the "request this item" action. Admin product
 * management (create/delete/availability) and request handling live in
 * src/app/admin/actions.ts behind requireAdmin(). RLS enforces that any
 * signed-in user may browse products and create their own requests.
 */

export type Product = Tables<"products">;

export type StoreActionResult = { ok: true } | { ok: false; error: string };

function friendly(message: string): string {
  return /relation|does not exist|schema cache|could not find the table/i.test(
    message,
  )
    ? "The store isn't set up on the server yet (migration 0021)."
    : message;
}

/** All products for the store, available ones first, newest first. */
export async function getStoreProducts(): Promise<{
  products: Product[];
  available: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("available", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { products: [], available: false };
  return { products: data ?? [], available: true };
}

/** Product ids the current user already has a pending request for. */
export async function getMyPendingProductIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("product_requests")
    .select("product_id")
    .eq("status", "pending");
  return (data ?? []).map((r) => r.product_id);
}

/** Request a product. Dedupes against an existing pending request. */
export async function requestProduct(
  productId: string,
  note?: string,
): Promise<StoreActionResult> {
  const parsed = z
    .object({
      productId: z.string().uuid(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({ productId, note });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to request an item." };

  // Already have a pending request for this product? Treat as success.
  const { data: existing } = await supabase
    .from("product_requests")
    .select("id")
    .eq("product_id", parsed.data.productId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return { ok: true };

  const { error } = await supabase.from("product_requests").insert({
    product_id: parsed.data.productId,
    user_id: user.id,
    note: parsed.data.note || null,
  });
  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/store");
  revalidatePath("/admin");
  return { ok: true };
}

/** Cancel the caller's pending request for a product (from the store page). */
export async function cancelMyRequest(
  productId: string,
): Promise<StoreActionResult> {
  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, error: "Invalid request." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { error } = await supabase
    .from("product_requests")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/store");
  revalidatePath("/admin");
  return { ok: true };
}

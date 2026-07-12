"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin sign-in. Authenticates like a normal user, then requires the `is_admin`
 * app_metadata claim — a non-admin is immediately signed back out. On success,
 * lands on the admin dashboard.
 */
export async function adminLogin(formData: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) {
    redirect(`/admin/login?message=${encodeURIComponent(error.message)}`);
  }

  if (!isAdmin(data.user)) {
    await supabase.auth.signOut();
    redirect(
      `/admin/login?message=${encodeURIComponent(
        "That account is not an administrator.",
      )}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/admin");
}

/** Create an announcement (admin only; RLS also enforces `is_admin()`). */
export async function createAnnouncement(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const title = String(formData.get("title")).trim();
  const body = String(formData.get("body")).trim();
  if (!title || !body) {
    redirect(`/admin?message=${encodeURIComponent("Title and body are required.")}`);
  }

  const { error } = await supabase
    .from("announcements")
    .insert({ title, body });

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/announcements");
  redirect("/admin");
}

/**
 * Grant or revoke the `is_admin` app_metadata claim on another account
 * (admin only). Uses the service-role client since only it can write the Auth
 * admin API. Existing app_metadata is preserved (merged), and an admin can't
 * revoke their own access — that would risk locking everyone out.
 */
export async function setUserAdmin(formData: FormData) {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId"));
  const makeAdmin = String(formData.get("makeAdmin")) === "true";

  if (!userId) {
    redirect(`/admin?message=${encodeURIComponent("Missing user id.")}`);
  }
  if (userId === admin.id && !makeAdmin) {
    redirect(
      `/admin?message=${encodeURIComponent("You can't revoke your own admin access.")}`,
    );
  }

  const svc = createAdminClient();

  // Preserve other app_metadata (provider, etc.) by merging onto the existing.
  const { data: target, error: readErr } =
    await svc.auth.admin.getUserById(userId);
  if (readErr || !target?.user) {
    redirect(
      `/admin?message=${encodeURIComponent(readErr?.message ?? "User not found.")}`,
    );
  }

  const { error } = await svc.auth.admin.updateUserById(userId, {
    app_metadata: { ...target.user.app_metadata, is_admin: makeAdmin },
  });
  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect(
    `/admin?message=${encodeURIComponent(
      `${target.user.email ?? "User"} is ${makeAdmin ? "now an admin" : "no longer an admin"}.`,
    )}`,
  );
}

/** Delete an announcement (admin only). */
export async function deleteAnnouncement(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const id = String(formData.get("id"));
  const { error } = await supabase.from("announcements").delete().eq("id", id);

  if (error) {
    redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/announcements");
  redirect("/admin");
}

/* -------------------------------------------------------------------------- */
/* Store — admin product management + request handling                        */
/* -------------------------------------------------------------------------- */

const ProductInput = z.object({
  name: z.string().trim().min(1).max(160),
  price: z.number().nonnegative().finite(),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().max(2000).optional().or(z.literal("")),
});

export type CreateProductResult = { ok: true } | { ok: false; error: string };

/**
 * Add a product to the store (admin only). Called from the client product
 * form, which first uploads the image to the `product-images` bucket and
 * passes the resulting public URL.
 */
export async function createProduct(input: {
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
}): Promise<CreateProductResult> {
  await requireAdmin();
  const parsed = ProductInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Name and a valid price are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    name: parsed.data.name,
    price: parsed.data.price,
    description: parsed.data.description || null,
    image_url: parsed.data.imageUrl || null,
  });
  if (error) {
    return {
      ok: false,
      error: /relation|does not exist|schema cache|could not find the table/i.test(
        error.message,
      )
        ? "The store isn't set up yet (run migration 0021)."
        : error.message,
    };
  }

  revalidatePath("/store");
  revalidatePath("/admin");
  return { ok: true };
}

/** Delete a product (admin only). */
export async function deleteProduct(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/store");
  revalidatePath("/admin");
  redirect("/admin?message=Product+removed.");
}

/** Toggle a product's availability (admin only). */
export async function setProductAvailability(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const available = String(formData.get("available")) === "true";
  const { error } = await supabase
    .from("products")
    .update({ available, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/store");
  revalidatePath("/admin");
  redirect("/admin");
}

/** Update a product request's status: fulfilled / declined / pending (admin). */
export async function setRequestStatus(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const parsedStatus = z
    .enum(["pending", "fulfilled", "declined"])
    .safeParse(formData.get("status"));
  if (!parsedStatus.success) {
    redirect(`/admin?message=${encodeURIComponent("Invalid status.")}`);
  }
  const { error } = await supabase
    .from("product_requests")
    .update({ status: parsedStatus.data })
    .eq("id", id);
  if (error) redirect(`/admin?message=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
  redirect("/admin");
}

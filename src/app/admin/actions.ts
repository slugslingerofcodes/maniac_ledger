"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

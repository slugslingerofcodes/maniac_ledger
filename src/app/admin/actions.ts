"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

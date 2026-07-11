"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/**
 * Social actions (migration 0015): claim a public handle, toggle visibility,
 * follow/unfollow. RLS enforces that users only write their own profile and
 * their own follow edges.
 */

export type SocialActionResult = { ok: true } | { ok: false; error: string };

const USERNAME = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,24}$/,
    "3–24 characters: lowercase letters, numbers, underscores.",
  );

function friendly(error: { message: string }): string {
  if (
    /relation|does not exist|schema cache|could not find the table/i.test(
      error.message,
    )
  ) {
    return "Social features aren't set up on the server yet (migration 0015).";
  }
  if (/duplicate|unique/i.test(error.message)) {
    return "That username is taken.";
  }
  return error.message;
}

export type MyProfile = {
  username: string;
  isPublic: boolean;
} | null;

/** The caller's profile row, or null when unclaimed / migration missing. */
export async function getMyProfile(): Promise<MyProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("username, is_public")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return { username: data.username, isPublic: data.is_public };
}

export async function claimProfile(
  username: string,
  isPublic: boolean,
): Promise<SocialActionResult> {
  const parsed = USERNAME.safeParse(username);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      username: parsed.data,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: friendly(error) };

  revalidatePath("/profile");
  revalidatePath(`/users/${parsed.data}`);
  return { ok: true };
}

// Following was replaced by the mutual-friends model (see
// src/app/actions/friends.ts). The one-way follow actions were removed.

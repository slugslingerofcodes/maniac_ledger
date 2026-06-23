import type { User } from "@supabase/supabase-js";

/**
 * The name to show for a user in the UI: their chosen username (stored in
 * Supabase `user_metadata.username`), falling back to the local part of their
 * email, then a generic label. Keeps the email out of the chrome once a
 * username is set.
 */
export function getDisplayName(user: User | null): string {
  const raw = user?.user_metadata?.username;
  const username = typeof raw === "string" ? raw.trim() : "";
  if (username) return username;

  const email = user?.email ?? "";
  return email ? email.split("@")[0]! : "Account";
}

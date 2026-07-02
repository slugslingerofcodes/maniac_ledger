import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The current authenticated user, or `null`. Memoized with React `cache` so
 * multiple callers within a single server render share one Supabase round-trip.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Server-side route guard for Server Components, Server Actions, and Route
 * Handlers. Returns the user when signed in, or redirects to /login otherwise.
 *
 * This is the secure complement to the optimistic redirect in src/proxy.ts and
 * the client-side useAuthGuard hook.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** True when the user's server-controlled app_metadata flags them an admin. */
export function isAdmin(user: User | null): boolean {
  return user?.app_metadata?.is_admin === true;
}

/**
 * Route guard for the admin area. Redirects to /admin/login unless the current
 * user is signed in AND flagged `is_admin` in app_metadata (set via SQL; see
 * migration 0011). The DB enforces the same via RLS `is_admin()`.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getUser();
  if (!user || !isAdmin(user)) {
    redirect("/admin/login");
  }
  return user;
}

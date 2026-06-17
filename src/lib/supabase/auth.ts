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

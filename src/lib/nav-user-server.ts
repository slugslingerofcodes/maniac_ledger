import { getUser } from "@/lib/supabase/auth";
import { toNavUser, type NavUser } from "@/lib/nav-user";

/**
 * The header's user, as a promise the layouts pass straight through to the
 * client header without awaiting it — a layout that awaited Supabase Auth
 * would hold back every route's shell (and its loading skeleton) for that
 * round trip. The header reads it with `use()` behind its own Suspense
 * boundary, so only the account button waits.
 *
 * `getUser()` is the same request-memoized call every protected page makes
 * through `requireUser()`, so this adds no Auth round trip. Never rejects: a
 * failed lookup renders the signed-out fallback rather than an error boundary.
 */
export function getNavUser(): Promise<NavUser | null> {
  return getUser().then(toNavUser, () => null);
}

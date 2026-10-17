import type { User } from "@supabase/supabase-js";

import { getDisplayName } from "@/lib/user";

/**
 * Exactly what the header shows about the signed-in user — no more.
 *
 * The header used to learn this in the browser: `useUser()` constructed the
 * Supabase browser client (a ~62 KB gzipped chunk on every authed route) and
 * then asked Supabase Auth over the network, so the avatar sat on "?" until
 * well after hydration. The layouts now derive it on the server from the
 * request's already-verified `getUser()` (memoized per request, so this costs
 * no extra Auth round trip) and hand it to the header. A plain serializable
 * object, because it crosses the server → client boundary.
 */
export type NavUser = {
  /** Username, else the email's local part, else "Account". */
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Public profile slug, when one has been chosen. */
  username: string | null;
  /** From server-controlled app_metadata; only gates the menu link. */
  isAdmin: boolean;
};

export function toNavUser(user: User | null): NavUser | null {
  if (!user) return null;
  const avatar = user.user_metadata?.avatar_url;
  const username = user.user_metadata?.username;
  return {
    name: getDisplayName(user),
    email: user.email ?? "",
    avatarUrl: typeof avatar === "string" ? avatar : null,
    username: typeof username === "string" && username ? username : null,
    isAdmin: user.app_metadata?.is_admin === true,
  };
}

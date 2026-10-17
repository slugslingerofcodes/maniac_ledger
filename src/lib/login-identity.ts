import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolving what someone typed into the sign-in box to an address Supabase
 * Auth will accept.
 *
 * Supabase authenticates on email; there is no username grant. So logging in
 * by username means looking the email up first — and that lookup is the whole
 * security-sensitive surface of this feature:
 *
 * - **It needs the service role.** `profiles` is only selectable `to
 *   authenticated` (migration 0015), and a visitor on /login is not. Emails
 *   live in `auth.users`, reachable solely through the Auth admin API.
 * - **The email never leaves the server.** It is passed straight into
 *   `signInWithPassword` and never returned to the caller, so this cannot be
 *   turned into a username→email oracle.
 * - **Callers must not distinguish "no such user" from "wrong password".**
 *   Returning null here means "couldn't resolve"; the action above reports the
 *   same message it uses for a bad password.
 *
 * **Server-only** — it constructs the service-role client, which bypasses RLS.
 * Never import from a Client Component.
 */

/** Matches `profiles.username`'s CHECK constraint exactly. */
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export type LoginIdentity =
  | { kind: "email"; email: string }
  | { kind: "username"; username: string };

/**
 * Classify the sign-in field's contents.
 *
 * The `@` test is deliberately crude: anything containing one is handed to
 * Supabase as an email and allowed to fail its own validation there. Usernames
 * cannot contain `@` (the CHECK forbids it), so there is no ambiguity to
 * resolve — and being loose here keeps email sign-in working as a fallback if
 * the username lookup is ever unavailable.
 */
export function parseLoginIdentifier(raw: string): LoginIdentity | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes("@")) return { kind: "email", email: value };

  const username = value.toLowerCase();
  return USERNAME_RE.test(username) ? { kind: "username", username } : null;
}

/**
 * The email behind a username, or null if there isn't one.
 *
 * Returns null rather than throwing for every "couldn't find it" case — a
 * missing profile, a deleted auth user, a misconfigured server — because the
 * caller renders one generic failure for all of them anyway. The one thing it
 * distinguishes is a *configuration* problem, which it logs, because "no user
 * can sign in" and "this user typed the wrong name" need different responses
 * from whoever is on call.
 */
export async function emailForUsername(username: string): Promise<string | null> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error(
      "[login] SUPABASE_SERVICE_ROLE_KEY missing — username sign-in cannot " +
        "resolve an account. Email sign-in still works.",
      err,
    );
    return null;
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("[login] profile lookup failed:", error);
    return null;
  }
  if (!profile) return null;

  const { data, error: userErr } = await admin.auth.admin.getUserById(
    profile.user_id,
  );
  if (userErr) {
    console.error("[login] auth lookup failed:", userErr);
    return null;
  }
  return data.user?.email ?? null;
}

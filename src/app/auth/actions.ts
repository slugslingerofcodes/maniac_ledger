"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  emailForUsername,
  parseLoginIdentifier,
} from "@/lib/login-identity";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Absolute origin of the current request, used to build redirect URLs for
// email links and OAuth callbacks. Origin is present on browser POSTs; the
// forwarded-host fallback covers clients that omit it, so redirectTo never
// degrades to a relative (broken) URL.
async function getOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
}

/**
 * One message for every way signing in can fail.
 *
 * Usernames here are semi-public (they address `/users/[username]`), but a
 * login form that says "no such user" for one input and "wrong password" for
 * another still confirms exactly which accounts exist, and it does so to an
 * unauthenticated caller with no rate limit of its own. One string for all
 * cases costs the honest user nothing — they retype either field regardless.
 */
const SIGN_IN_FAILED = "Incorrect username or password.";

/** Attempts per IP per window. Generous for a person, tight for a script. */
const LOGIN_LIMIT = 12;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export async function login(formData: FormData) {
  const supabase = await createClient();

  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");

  // Throttle before the lookup, not after: resolving a username costs a
  // service-role round trip *and* an Auth admin call, so an unthrottled form
  // would let anyone spend that budget at will, quite apart from the password
  // guessing it would enable.
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  if (!checkRateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS).ok) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Too many sign-in attempts — wait a few minutes and try again.",
      )}`,
    );
  }

  const identity = parseLoginIdentifier(identifier);
  if (!identity) {
    redirect(`/login?message=${encodeURIComponent(SIGN_IN_FAILED)}`);
  }

  // An email still works. Not a hedge on the requirement — it is what keeps a
  // missing/rotated SUPABASE_SERVICE_ROLE_KEY from locking every user out of
  // an app whose front door now depends on it. See `login-identity.ts`.
  const email =
    identity.kind === "email"
      ? identity.email
      : await emailForUsername(identity.username);

  if (!email) {
    redirect(`/login?message=${encodeURIComponent(SIGN_IN_FAILED)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own message ("Invalid login credentials", "Email not
    // confirmed") is passed through only when it tells the user something they
    // can act on that isn't about *which* account exists.
    const message = /confirm/i.test(error.message) ? error.message : SIGN_IN_FAILED;
    redirect(`/login?message=${encodeURIComponent(message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/choose");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const origin = await getOrigin();

  // Enforced against `profiles.username`'s exact CHECK, not a looser rule of
  // its own. This used to accept 2–32 characters of anything, which now would
  // be a trap: the username is the *login credential*, so a name that the
  // profiles table has to sanitise on the way in ("Jo Smith" -> "jo_smith")
  // leaves someone unable to sign in with the name they just chose.
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    redirect(
      `/signup?message=${encodeURIComponent(
        "Pick a username of 3–24 characters, using letters, numbers or underscores.",
      )}`,
    );
  }

  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    // Stored as user_metadata.username — the display name read by getDisplayName.
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      data: { username: username.slice(0, 32) },
    },
  });

  if (error) {
    redirect(`/signup?message=${encodeURIComponent(error.message)}`);
  }

  // With "Confirm email" enabled (the Supabase default), the user must click
  // the link sent to their inbox before they can sign in.
  redirect(
    `/login?message=${encodeURIComponent(
      "Check your email to confirm your account, then sign in.",
    )}`,
  );
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  // Hand the browser off to Google's consent screen. The server client has
  // already stored the PKCE code verifier in a cookie for /auth/callback.
  redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(
    String(formData.get("email")),
    {
      // The recovery link verifies via /auth/confirm (type=recovery), which
      // signs the user in and forwards them to the update-password page.
      redirectTo: `${origin}/auth/confirm?next=/account/update-password`,
    },
  );

  if (error) {
    redirect(`/reset-password?message=${encodeURIComponent(error.message)}`);
  }

  // Generic message regardless of whether the email exists (avoids leaking
  // which addresses are registered).
  redirect(
    `/reset-password?message=${encodeURIComponent(
      "If that email is registered, a password reset link is on its way.",
    )}`,
  );
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password"));
  const confirm = String(formData.get("confirm"));

  if (password !== confirm) {
    redirect(
      `/account/update-password?message=${encodeURIComponent(
        "Passwords do not match.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `/account/update-password?message=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

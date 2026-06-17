"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Absolute origin of the current request, used to build redirect URLs for
// email links and OAuth callbacks.
async function getOrigin() {
  return (await headers()).get("origin") ?? "";
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { emailRedirectTo: `${origin}/auth/confirm` },
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

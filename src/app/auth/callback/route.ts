import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) and other PKCE flows redirect back here with a `?code=` that
// we exchange for a session. The session cookies are set on the server client.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // `next` is attacker-controllable — it arrives on a link the user clicks.
  // Validated to a same-origin path before it is ever concatenated onto origin.
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth (Google) users never see the signup form, so give them the same
      // default as the backfill — username = email — if they don't have one yet.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const existing = user?.user_metadata?.username;
      if (user && !(typeof existing === "string" && existing.trim())) {
        await supabase.auth.updateUser({ data: { username: user.email ?? "" } });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?message=${encodeURIComponent(
      "Could not sign you in. Please try again.",
    )}`,
  );
}

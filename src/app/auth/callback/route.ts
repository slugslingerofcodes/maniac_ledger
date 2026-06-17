import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// OAuth (Google) and other PKCE flows redirect back here with a `?code=` that
// we exchange for a session. The session cookies are set on the server client.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?message=${encodeURIComponent(
      "Could not sign you in. Please try again.",
    )}`,
  );
}

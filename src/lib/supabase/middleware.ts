import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every matched request and keeps the
 * auth cookies in sync between the request and the response. Called from the
 * Next.js 16 proxy (src/proxy.ts).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not run code between createServerClient and getUser().
  // getUser() revalidates the token and triggers the cookie refresh above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth gate: redirect unauthenticated users to /login. Public paths (the
  // auth pages, the /auth/* email/OAuth callback routes, and the public anime
  // search API, which only proxies third-party MyAnimeList data) are allowed.
  const publicPaths = [
    "/login",
    "/signup",
    "/reset-password",
    "/auth",
    "/api/anime/search",
    "/admin/login",
  ];
  const { pathname } = request.nextUrl;
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    // Unauthenticated admin routes go to the admin sign-in, not the user one.
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so the refreshed auth cookies are
  // sent to the browser. If you create a new response, copy over its cookies.
  return supabaseResponse;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable without a session: the auth pages, the /auth/* email and
 * OAuth callback routes, the public anime search API (it only proxies
 * third-party MyAnimeList data), and the PWA assets — which must be fetchable
 * signed-out or install/offline breaks.
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth",
  "/api/anime/search",
  "/admin/login",
  "/manifest.webmanifest",
  "/sw.js",
];

/**
 * Exact match, or a match on a path-segment boundary.
 *
 * A bare `startsWith` would make anything merely *beginning* with a public
 * path public too — `/authors`, `/logins`, `/signup-admin`, or any file in
 * public/ named `auth*`. Nothing exploits that today, which is exactly why it
 * was worth closing: the day someone adds a route whose name happens to start
 * with one of these, it ships unauthenticated and nothing says so.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every matched request and keeps the
 * auth cookies in sync between the request and the response. Called from the
 * Next.js 16 proxy (src/proxy.ts).
 */
export async function updateSession(
  request: NextRequest,
  /**
   * Extra headers to forward to the render. Used to hand the CSP nonce to
   * Next (via `x-nonce` and the request-side `Content-Security-Policy`), which
   * is how Next knows to stamp its own bootstrap scripts with it.
   *
   * Threaded through here rather than applied in the proxy because every
   * `NextResponse.next()` below must carry them — rebuilding the response
   * afterwards would drop the refreshed Supabase auth cookies.
   */
  requestHeaders?: Headers,
) {
  const nextInit = requestHeaders
    ? { request: { headers: requestHeaders } }
    : { request };
  let supabaseResponse = NextResponse.next(nextInit);

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
          supabaseResponse = NextResponse.next(nextInit);
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

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    // Unauthenticated admin routes go to the admin sign-in, not the user one.
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so the refreshed auth cookies are
  // sent to the browser. If you create a new response, copy over its cookies.
  return supabaseResponse;
}

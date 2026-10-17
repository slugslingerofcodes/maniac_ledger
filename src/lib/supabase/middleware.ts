import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable without a session: the auth pages, the /auth/* email and
 * OAuth callback routes, the public anime search API (it only proxies
 * third-party MyAnimeList data), the PWA assets — which must be fetchable
 * signed-out or install/offline breaks — and the calendar subscription feed,
 * which calendar apps fetch without cookies and which checks its own
 * per-user token (src/app/api/calendar/feed/[token]/route.ts).
 */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth",
  "/api/anime/search",
  "/api/calendar/feed",
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
 * Whether the request carries a session whose access token verifies.
 *
 * `getClaims()`, not `getUser()`: this runs before *every* matched request, and
 * `getUser()` is a network round trip to Supabase Auth each time — before the
 * page has even started rendering, and from a Vercel region that may be an
 * ocean away from the project. `getClaims()` verifies the JWT's signature
 * locally with WebCrypto against the project's published JWKS (an ES256 key;
 * auth-js caches the key set process-wide for 10 minutes), so a warm instance
 * gates a request with no network I/O at all. A token signed with the legacy
 * HS256 secret can't be verified that way, and for those auth-js falls back
 * to `getUser()` on its own — so no project setting makes this slower than it
 * was.
 *
 * What it gives up: `getUser()` would also notice a session revoked
 * server-side (sign out everywhere, a deleted or banned user) before its
 * access token expires — up to the JWT lifetime, an hour by default. That is
 * acceptable *here* because this is the optimistic gate, not the security
 * boundary: `requireUser()` in every protected page and action still calls
 * `getUser()`, and RLS already honours that same unexpired token for that
 * same window, so nothing behind this gate becomes reachable that the
 * database wouldn't serve anyway.
 */
async function hasVerifiedSession(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    return !error && typeof data?.claims?.sub === "string";
  } catch {
    // getClaims only models auth failures as `{ error }`; anything else it
    // rethrows (a WebCrypto failure, say). A gate that throws 500s every route
    // on the site, so fall back to the authoritative check instead.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user != null;
  }
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

  // IMPORTANT: Do not run code between createServerClient and the session
  // check. It reads the session from the cookies — refreshing it, and so
  // triggering the cookie sync above, when the access token is expiring.
  const signedIn = await hasVerifiedSession(supabase);

  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    // Unauthenticated admin routes go to the admin sign-in, not the user one.
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so the refreshed auth cookies are
  // sent to the browser. If you create a new response, copy over its cookies.
  return supabaseResponse;
}

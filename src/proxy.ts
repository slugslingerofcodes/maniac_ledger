import { type NextRequest } from "next/server";

import { buildCsp } from "@/lib/csp";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (function `middleware` -> `proxy`).
// Proxy runs on the Node.js runtime, which is what @supabase/ssr needs.
export async function proxy(request: NextRequest) {
  const { nonce, policy } = buildCsp(process.env.NODE_ENV === "development");

  // Next reads the nonce off the *request*-side CSP header and stamps it onto
  // the bootstrap scripts it injects. Without this, the page's own scripts are
  // blocked by the policy we're about to set — the classic way a first CSP
  // rollout white-screens an app.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  // Passed through rather than applied here: updateSession rebuilds its
  // response whenever Supabase refreshes cookies, so the headers have to be
  // baked into every `NextResponse.next()` it makes. Replacing the response
  // afterwards would drop those cookies and silently sign people out.
  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", policy);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and common image/video assets
     * Always run on routes that may set/refresh auth cookies.
     *
     * Video matters as much as images here: a <video> streams via HTTP range
     * requests, so every seek/buffer would otherwise cost a Supabase
     * `getUser()` round-trip in the proxy — and 307 away entirely for
     * signed-out viewers. These are decorative files in public/, public by
     * nature.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};

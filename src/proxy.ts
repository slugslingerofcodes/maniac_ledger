import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (function `middleware` -> `proxy`).
// Proxy runs on the Node.js runtime, which is what @supabase/ssr needs.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
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
     * `getUser()` round-trip in the proxy — and 307 away entirely for signed-out
     * viewers. These are decorative files in public/, public by nature.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};

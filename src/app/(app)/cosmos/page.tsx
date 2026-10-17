import { cache, Suspense } from "react";
import Link from "next/link";

import { CosmosStage } from "@/components/cosmos/CosmosStage";
import type { CosmosItem } from "@/components/cosmos/PosterCosmos";
import { Skeleton } from "@/components/ui/skeleton";
import { getCosmosPool } from "@/lib/cosmos-pool";
import { requireUser } from "@/lib/supabase/auth";

export const metadata = {
  title: "Cosmos · anime_maniacs",
  description: "A wall of anime posters you push a lens across.",
};

// The pool is reshuffled per visit, so this must never be cached as a page.
export const dynamic = "force-dynamic";

/**
 * The pool, once per request: the subtitle and the stage both need it, and an
 * unshared second call would draw a *different* random wall.
 */
const getItems = cache(async (): Promise<CosmosItem[]> => {
  const pool = await getCosmosPool();
  return pool.map((entry) => ({
    key: String(entry.malId),
    href: `/anime/mal/${entry.malId}`,
    title: entry.title,
    posterUrl: entry.posterUrl,
    score: entry.score,
  }));
});

export default async function CosmosPage() {
  // Defence in depth: the proxy already redirects signed-out visitors, but a
  // middleware bypass (Next has shipped advisories for exactly that) would
  // otherwise leave this page rendering. The server guard is the real gate.
  await requireUser();

  // The black field and the header paint at once; the poster pool (a few
  // upstream pages, AniList first) streams into the stage when it lands.
  return (
    // `overflow-hidden` + `overscroll-none`: the mosaic is a fixed, edge-to-edge
    // canvas, so there is nothing to scroll to — any horizontal movement is
    // either a stray overflow or a trackpad swipe that would drag the whole
    // page sideways (and, on iOS, trigger back-navigation) mid-drag.
    <div className="relative flex flex-1 flex-col overflow-hidden overscroll-none">
      {/* Near-black field behind the mosaic. The (app) backdrop is suppressed
          for this route, so this is the only layer under the scene — the tiles
          pack edge to edge and should meet nothing but black in the gaps. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[#0a0a0a]"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <h1 className="text-lg font-medium tracking-tight text-white/90 sm:text-xl">
            Cosmos
          </h1>
          <p className="mt-0.5 max-w-sm text-xs text-white/40">
            <Suspense fallback="A wall of anime, edge to edge">
              <Subtitle />
            </Suspense>
          </p>
        </div>
        <Link
          href="/library"
          className="pointer-events-auto shrink-0 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/60 backdrop-blur transition-colors hover:border-white/30 hover:text-white"
        >
          Your library
        </Link>
      </div>

      {/* min-h keeps the absolutely-positioned canvas from collapsing to zero
          on short viewports, where flex-1 alone resolves to no height. */}
      <div className="relative min-h-[70vh] flex-1 overflow-hidden">
        <Suspense fallback={<MosaicSkeleton />}>
          <Stage />
        </Suspense>
      </div>
    </div>
  );
}

async function Subtitle() {
  const items = await getItems();
  return items.length > 0
    ? "Move to magnify · click a poster to open it"
    : "A wall of anime, edge to edge";
}

async function Stage() {
  return <CosmosStage items={await getItems()} />;
}

/** Dim tiles packed edge to edge, like the real mosaic (and loading.tsx). */
function MosaicSkeleton() {
  return (
    <div className="absolute inset-0 grid grid-cols-4 content-start gap-1 p-1 sm:grid-cols-6 lg:grid-cols-8">
      {Array.from({ length: 32 }).map((_, i) => (
        <Skeleton
          key={i}
          className="aspect-[2/3] w-full rounded-sm bg-white/[0.06]"
        />
      ))}
    </div>
  );
}

import Link from "next/link";

import { CosmosStage } from "@/components/cosmos/CosmosStage";
import type { CosmosItem } from "@/components/cosmos/PosterCosmos";
import { getCosmosPool } from "@/lib/cosmos-pool";
import { requireUser } from "@/lib/supabase/auth";

export const metadata = {
  title: "Cosmos · anime_maniacs",
  description: "A wall of anime posters you push a lens across.",
};

// The pool is reshuffled per visit, so this must never be cached as a page.
export const dynamic = "force-dynamic";

export default async function CosmosPage() {
  // Defence in depth: the proxy already redirects signed-out visitors, but a
  // middleware bypass (Next has shipped advisories for exactly that) would
  // otherwise leave this page rendering. The server guard is the real gate.
  await requireUser();
  const pool = await getCosmosPool();
  const items: CosmosItem[] = pool.map((entry) => ({
    key: String(entry.malId),
    href: `/anime/mal/${entry.malId}`,
    title: entry.title,
    posterUrl: entry.posterUrl,
    score: entry.score,
  }));

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
            {items.length > 0
              ? "Move to magnify · click a poster to open it"
              : "A wall of anime, edge to edge"}
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
        <CosmosStage items={items} />
      </div>
    </div>
  );
}

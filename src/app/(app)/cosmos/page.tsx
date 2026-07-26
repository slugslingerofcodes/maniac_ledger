import Link from "next/link";

import { CosmosStage } from "@/components/cosmos/CosmosStage";
import type { CosmosItem } from "@/components/cosmos/PosterCosmos";
import { getUserLibrary } from "@/app/actions/library";

export const metadata = {
  title: "Cosmos · anime_maniacs",
  description: "Your anime library as a 3D galaxy you can spin and fly into.",
};

// Per-user data, and the whole point of the page is the live library.
export const dynamic = "force-dynamic";

/**
 * The mosaic repeats posters to fill the grid, so it needs variety rather than
 * volume — and the whole library is uploaded as GPU textures, which a 900-title
 * account should not have to pay for. 300 distinct posters is far more than any
 * screen shows at once.
 */
const MAX_CARDS = 300;

export default async function CosmosPage() {
  let items: CosmosItem[] = [];
  try {
    const library = await getUserLibrary();
    items = library
      .filter((entry): entry is typeof entry & { posterUrl: string } =>
        Boolean(entry.posterUrl),
      )
      .slice(0, MAX_CARDS)
      .map((entry) => ({
        id: entry.id,
        title: entry.titleEnglish ?? entry.title,
        posterUrl: entry.posterUrl,
        score: entry.score,
      }));
  } catch {
    // A library fetch failure lands on the same empty state as no library —
    // the page is decorative, and an error screen here helps nobody.
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Near-black field behind the mosaic. The (app) backdrop is suppressed
          for this route, so this is the only layer under the scene — the tiles
          pack edge to edge and should meet nothing but black in the gaps. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[#0a0a0a]"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-white/90 sm:text-xl">
            Your Cosmos
          </h1>
          <p className="mt-0.5 max-w-sm text-xs text-white/40">
            {items.length > 0
              ? "Move to magnify · click a poster to open it"
              : "Your collection, wall to wall"}
          </p>
        </div>
        <Link
          href="/library"
          className="pointer-events-auto shrink-0 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/60 backdrop-blur transition-colors hover:border-white/30 hover:text-white"
        >
          Grid view
        </Link>
      </div>

      {/* min-h keeps the absolutely-positioned canvas from collapsing to zero
          on short viewports, where flex-1 alone resolves to no height. */}
      <div className="relative min-h-[70vh] flex-1">
        <CosmosStage items={items} />
      </div>
    </div>
  );
}

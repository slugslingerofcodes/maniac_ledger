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
 * Every card is a draw call with its own texture, so a 900-title library would
 * shred a phone. 150 still fills the shell densely — past that the orb is a
 * solid ball and extra posters are never visible anyway.
 */
const MAX_CARDS = 150;

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
      {/* Deep-space wash behind the canvas. The (app) backdrop is suppressed
          for this route, so this is the only layer under the scene. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.22_0.06_290)_0%,oklch(0.13_0.03_285)_45%,oklch(0.09_0.01_280)_100%)]"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <h1 className="text-gradient text-2xl font-bold tracking-tight sm:text-3xl">
            Your Cosmos
          </h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {items.length > 0
              ? "Drag to spin · scroll to zoom · click a poster to fly in"
              : "Your collection, in orbit"}
          </p>
        </div>
        <Link
          href="/library"
          className="pointer-events-auto shrink-0 rounded-full border border-border bg-background/60 px-3.5 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
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

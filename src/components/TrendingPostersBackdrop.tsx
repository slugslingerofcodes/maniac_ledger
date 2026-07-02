/**
 * A dimmed, blurred, slowly-drifting wall of trending anime posters — used as
 * the /library backdrop. Presentational (no hooks) so a Server Component can
 * render it directly with poster URLs fetched server-side. A strong scrim keeps
 * the library grid readable on top.
 */
export function TrendingPostersBackdrop({ posters }: { posters: string[] }) {
  if (posters.length === 0) return null;

  // Repeat so the grid fills tall viewports even with a small poster set.
  const tiles = [...posters, ...posters, ...posters].slice(0, 48);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="ken-burns absolute inset-0 grid scale-110 grid-cols-4 gap-2 blur-[3px] sm:grid-cols-6 lg:grid-cols-8">
        {tiles.map((src, i) => (
          <div key={i} className="aspect-[2/3] overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
      {/* Scrim: moderate darken + top/bottom vignette; keeps posters visible
          while the card grid on top stays readable. */}
      <div className="absolute inset-0 bg-background/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/30 to-background/80" />
    </div>
  );
}

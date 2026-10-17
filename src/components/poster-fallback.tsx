/**
 * Poster-shaped stand-in for a title with no artwork.
 *
 * The fallback used to be the words "No image" centered in an empty box, which
 * left a visible hole in the rhythm of a poster grid. This keeps the 2:3 block
 * filled with something deliberate — the title's initial set in the brand serif
 * over the paper texture — so a missing poster costs the grid nothing.
 */
export function PosterFallback({ title }: { title: string }) {
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      data-slot="poster-fallback"
      className="pattern-seigaiha flex h-full items-center justify-center bg-gradient-to-br from-secondary to-accent"
    >
      <span
        aria-hidden
        className="font-didot text-6xl leading-none text-foreground/15"
      >
        {initial}
      </span>
    </div>
  );
}

import { AdvanceEpisodeButton } from "@/components/anime/AdvanceEpisodeButton";
import { BrowseRow } from "@/components/browse/BrowseRow";
import {
  ExpandingCard,
  LANDSCAPE_CARD_SIZES,
  LANDSCAPE_CARD_WIDTH,
} from "@/components/browse/ExpandingCard";
import { getLibrarySnapshot } from "@/lib/library-snapshot";

const LIMIT = 12;

/**
 * "Continue watching" — the first row on the home page: the viewer's
 * in-progress anime as landscape cards (poster art cropped to 16:9, held toward
 * the top where faces usually are), most recently watched first. Each card
 * says which episode is next, how many are left, and carries a progress bar
 * and the one-tap "+1". Renders nothing when there's nothing in progress.
 *
 * Reads the shared library snapshot (one query for every personal row) rather
 * than its own `user_progress` query.
 */
export async function ContinueWatching() {
  const library = await getLibrarySnapshot();
  const rows = library
    .filter((r) => r.status === "watching")
    .sort(
      (a, b) =>
        (Date.parse(b.lastWatchedAt ?? "") || 0) - (Date.parse(a.lastWatchedAt ?? "") || 0) ||
        (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0),
    )
    .slice(0, LIMIT);

  if (rows.length === 0) return null;

  return (
    <BrowseRow title="Continue watching" href="/library" className="pt-6">
      {rows.map((row, i) => {
        const total = row.totalEpisodes;
        const hasTotal = total != null && total > 0;
        // Next unwatched episode = one past the counter, clamped to the finale.
        // Drives the #ep-{number} anchor on the detail page.
        const nextEp = hasTotal
          ? Math.min(row.episodesWatched + 1, total!)
          : row.episodesWatched + 1;
        const percent = hasTotal
          ? Math.min(100, Math.round((row.episodesWatched / total!) * 100))
          : 0;
        const left = hasTotal ? total! - row.episodesWatched : null;

        return (
          <ExpandingCard
            key={row.animeId}
            href={`/anime/${row.animeId}#ep-${nextEp}`}
            title={row.titleEnglish ?? row.title}
            label={`${row.titleEnglish ?? row.title}, episode ${nextEp}`}
            posterUrl={row.posterUrl}
            aspect="landscape"
            widthClassName={LANDSCAPE_CARD_WIDTH}
            sizes={LANDSCAPE_CARD_SIZES}
            objectPosition="center 22%"
            eager={i < 3}
            overlay={
              <>
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-banner/90 via-banner/25 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-3 text-banner-foreground">
                  <h3 className="truncate text-sm font-semibold">
                    {row.titleEnglish ?? row.title}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-banner-foreground/75">
                    <span>
                      Episode {nextEp}
                      {hasTotal ? ` of ${total}` : ""}
                    </span>
                    {/* The decision-relevant number: how much is left. */}
                    {left != null && left > 0 ? (
                      <span className="rounded-full bg-banner-foreground/15 px-2 py-0.5 text-[11px] font-medium text-banner-foreground">
                        {left} left
                      </span>
                    ) : null}
                    {!hasTotal ? (
                      <span className="text-[11px] text-banner-foreground/60">ongoing</span>
                    ) : null}
                  </p>
                  {hasTotal ? (
                    <div
                      role="progressbar"
                      aria-label="Progress"
                      aria-valuemin={0}
                      aria-valuemax={total!}
                      aria-valuenow={row.episodesWatched}
                      className="status-watching mt-2 h-1 overflow-hidden rounded-full bg-banner-foreground/20"
                    >
                      <div
                        className="h-full origin-left rounded-full bg-[var(--status-accent)]"
                        style={{ transform: `scaleX(${percent / 100})` }}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            }
            controls={
              // One tap to advance, straight from the row. Always visible on
              // touch; on desktop it fades in with the card hover.
              <AdvanceEpisodeButton
                animeId={row.animeId}
                title={row.titleEnglish ?? row.title}
                episodesWatched={row.episodesWatched}
                totalEpisodes={total}
                status="watching"
                variant="full"
                source="rail"
                className="absolute right-2.5 top-2.5 z-10 pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover/cw:opacity-100 pointer-fine:focus-visible:opacity-100"
              />
            }
            className="group/cw"
          />
        );
      })}
    </BrowseRow>
  );
}

import Link from "next/link";

import { AdvanceEpisodeButton } from "@/components/anime/AdvanceEpisodeButton";
import { ScoreRing } from "@/components/ScoreRing";
import { SlimeIllustration } from "@/components/SlimeIllustration";
import { buttonVariants } from "@/components/ui/button";
import { getLibrarySnapshot } from "@/lib/library-snapshot";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { BrowseRow } from "./BrowseRow";
import { CardCaption, ExpandingCard, POSTER_CARD_WIDTH } from "./ExpandingCard";

/** Home preview cap — the full library lives on /library. */
const PREVIEW_LIMIT = 12;

/**
 * "Your library" as a row: the most recently added titles, each with its watch
 * status as a colored edge (the same `--status-accent` the library grid uses),
 * the viewer's score, and a progress bar; lifting a card offers the "+1".
 * Ends with a card into the full library when there's more. An empty library
 * keeps its invitation to search rather than vanishing.
 */
export async function LibraryRow() {
  const library = await getLibrarySnapshot();

  if (library.length === 0) {
    return (
      <section className="row-gutter pt-6" aria-label="Your library">
        <h2 className="text-lg font-semibold leading-7 tracking-tight sm:text-xl">
          Your library
        </h2>
        <div className="pattern-seigaiha mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
          <SlimeIllustration className="w-32" />
          <p className="text-sm text-muted-foreground">
            Your library is empty. Find something to watch.
          </p>
          <Link href="/search" className={cn(buttonVariants())}>
            Search anime
          </Link>
        </div>
      </section>
    );
  }

  const recent = [...library]
    .sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))
    .slice(0, PREVIEW_LIMIT);
  const hasMore = library.length > PREVIEW_LIMIT;

  return (
    <BrowseRow title="Your library" href="/library" eyebrow={`${library.length} titles`} className="pt-4">
      {recent.map((row) => {
        const status = WATCH_STATUS_META[row.status];
        const title = row.titleEnglish ?? row.title;
        const hasTotal = row.totalEpisodes != null && row.totalEpisodes > 0;
        const percent = hasTotal
          ? Math.min(100, Math.round((row.episodesWatched / row.totalEpisodes!) * 100))
          : 0;
        const progress = `${row.episodesWatched}${hasTotal ? ` / ${row.totalEpisodes}` : ""} ep`;

        return (
          <ExpandingCard
            key={row.animeId}
            href={`/anime/${row.animeId}`}
            title={title}
            posterUrl={row.posterUrl}
            className={status.tokenClassName}
            overlay={
              <>
                {/* Status as an edge rather than a pill: readable across a
                    whole row at a glance, and it costs no layout. */}
                <span aria-hidden className="status-edge absolute inset-y-0 left-0 z-10 w-[3px]" />
                {row.score != null ? (
                  <span className="absolute right-1.5 top-1.5 z-10 grid place-items-center rounded-full bg-banner/75 p-0.5 backdrop-blur">
                    <ScoreRing score={row.score} size={24} />
                  </span>
                ) : null}
                {hasTotal ? (
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-banner/40">
                    <div
                      className="h-full origin-left bg-[var(--status-accent)]"
                      style={{ transform: `scaleX(${percent / 100})` }}
                    />
                  </div>
                ) : null}
              </>
            }
            panel={
              <>
                <p className="line-clamp-2 text-[13px] font-semibold leading-tight">{title}</p>
                {/* The panel is always dark ink, so the label stays paper and
                    the status accent rides on a dot — light mode's accents are
                    tuned for paper and would sink into the scrim. */}
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                  <span aria-hidden className="size-1.5 rounded-full bg-[var(--status-accent)] ring-1 ring-banner-foreground/40" />
                  {status.label}
                </p>
                <p className="mt-0.5 text-[11px] text-banner-foreground/75">{progress}</p>
              </>
            }
            actions={
              row.status === "completed" ? null : (
                <AdvanceEpisodeButton
                  animeId={row.animeId}
                  title={title}
                  episodesWatched={row.episodesWatched}
                  totalEpisodes={row.totalEpisodes}
                  status={row.status}
                  variant="full"
                  source="grid"
                />
              )
            }
            caption={
              <CardCaption
                title={title}
                meta={
                  <>
                    <span className="sr-only">{status.label} · </span>
                    {row.type ? <span className="uppercase">{row.type} · </span> : null}
                    {progress}
                  </>
                }
              />
            }
          />
        );
      })}
      {hasMore ? (
        <div data-row-item="" role="listitem" className={cn("shrink-0 snap-start", POSTER_CARD_WIDTH)}>
          <Link
            href="/library"
            data-row-focus=""
            className="group flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 text-center outline-none transition-colors hover:border-primary/50 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-lg text-primary transition-colors group-hover:bg-primary/25">
              →
            </span>
            <span className="px-3 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              View your full library
            </span>
          </Link>
        </div>
      ) : null}
    </BrowseRow>
  );
}

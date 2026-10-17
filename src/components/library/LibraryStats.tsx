import {
  computeLibraryStats,
  formatCount,
  formatWatchTime,
  MINUTES_PER_EPISODE,
  type LibraryStatsInput,
} from "@/lib/library-stats";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";

/**
 * The numbers behind the current library search / filter: how many titles
 * matched, how far through them you are, how you rated them, how long they
 * took. Shown above the grid while a search or filter is active, so narrowing
 * the library answers "how much Mecha have I actually finished?" at a glance.
 *
 * Plain markup, no hooks: it re-derives from whatever list it is handed, which
 * is the already-filtered cached library, so it costs one pass per render.
 */
export function LibraryStats({
  items,
  libraryTotal,
  className,
}: {
  /** The entries the current search / filter matched. */
  items: readonly LibraryStatsInput[];
  /** Size of the whole library, for "12 of 87". */
  libraryTotal: number;
  className?: string;
}) {
  const s = computeLibraryStats(items);
  const pct = s.completion.ratio != null ? Math.round(s.completion.ratio * 100) : null;

  return (
    <section
      aria-label="Stats for these results"
      className={cn("rounded-xl bg-card/80 p-3 ring-1 ring-foreground/10 sm:p-4", className)}
    >
      {/* One short announcement per change, not the whole grid of numbers. */}
      <p className="sr-only" aria-live="polite">
        {s.titles} of {libraryTotal} titles match.
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Tile
          label="Titles"
          value={formatCount(s.titles)}
          detail={`of ${formatCount(libraryTotal)} in library`}
        />

        <Tile
          label="Episodes watched"
          value={formatCount(s.episodesWatched)}
          detail={
            pct != null
              ? `${pct}% of ${formatCount(s.completion.total)} episodes`
              : s.titles > 0
                ? "length not known yet"
                : "nothing matched"
          }
        >
          {s.completion.ratio != null ? (
            <div
              role="meter"
              aria-label="Episodes watched of the known total"
              aria-valuemin={0}
              aria-valuemax={s.completion.total}
              aria-valuenow={s.completion.watched}
              aria-valuetext={`${pct}%`}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary/15"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${s.completion.ratio * 100}%` }}
              />
            </div>
          ) : null}
        </Tile>

        <Tile
          label="Mean score"
          value={s.meanScore != null ? s.meanScore.toFixed(1) : "—"}
          detail={
            s.scoredTitles > 0
              ? `from ${formatCount(s.scoredTitles)} rated`
              : "nothing rated yet"
          }
        />

        <Tile
          label="Time watched"
          value={formatWatchTime(s.minutesWatched)}
          detail={`est. ${MINUTES_PER_EPISODE} min per episode`}
        />
      </dl>

      {s.byStatus.length > 0 ? (
        <ul
          aria-label="Titles by status"
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-foreground/10 pt-3 text-xs"
        >
          {s.byStatus.map(({ status, count }) => (
            <li
              key={status}
              className={cn("flex items-center gap-1.5", WATCH_STATUS_META[status].tokenClassName)}
            >
              <span aria-hidden className="size-2 rounded-full bg-[var(--status-accent)]" />
              <span className="text-muted-foreground">{WATCH_STATUS_META[status].label}</span>
              <span className="font-medium text-foreground">{formatCount(count)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Tile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <span className="block truncate text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {children}
        <span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span>
      </dd>
    </div>
  );
}

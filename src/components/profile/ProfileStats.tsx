import { WATCH_STATUS_META } from "@/lib/watch-status";
import type { WatchStatus } from "@/types/anime";

/**
 * Profile stats dashboard: big-number tiles, genre donut, status breakdown and
 * an episode-activity heatmap. Hand-rolled SVG/CSS (no chart deps) so it all
 * server-renders. Data comes in as plain rows; every chart is derived here.
 */

export type ProfileProgressRow = {
  episodesWatched: number;
  status: WatchStatus;
  score: number | null;
  genres: string[];
};

/** ~standard TV episode runtime, for the "days watched" estimate. */
const MINUTES_PER_EPISODE = 23;

const HEATMAP_WEEKS = 24;

const STATUS_BAR_COLOR: Record<WatchStatus, string> = {
  watching: "bg-emerald-400",
  completed: "bg-sky-400",
  plan_to_watch: "bg-violet-400",
  on_hold: "bg-amber-400",
  dropped: "bg-rose-400",
};

const STATUS_ORDER: WatchStatus[] = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];

export function ProfileStats({
  progress,
  activity,
}: {
  progress: ProfileProgressRow[];
  /** `episode_progress.watched_at` timestamps within the heatmap window. */
  activity: string[];
}) {
  if (progress.length === 0) {
    return (
      <section className="mt-6 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          Add anime to your library to unlock your stats.
        </p>
      </section>
    );
  }

  const episodes = progress.reduce((n, r) => n + r.episodesWatched, 0);
  const scores = progress.filter((r) => r.score != null);
  const meanScore =
    scores.length > 0
      ? scores.reduce((n, r) => n + (r.score ?? 0), 0) / scores.length
      : null;
  const minutes = episodes * MINUTES_PER_EPISODE;
  const days = minutes / (60 * 24);

  return (
    <section className="mt-6 flex flex-col gap-4" aria-label="Your stats">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={String(progress.length)} label="titles" />
        <StatTile value={episodes.toLocaleString()} label="episodes" />
        <StatTile
          value={days >= 1 ? days.toFixed(1) : String(Math.round(minutes / 60))}
          label={days >= 1 ? "days watched" : "hours watched"}
        />
        <StatTile
          value={meanScore != null ? meanScore.toFixed(1) : "—"}
          label="mean score"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <GenreDonut progress={progress} />
        <StatusBreakdown progress={progress} />
      </div>

      <ActivityHeatmap activity={activity} />
    </section>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="font-didot text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/* ------------------------------- Genre donut ------------------------------ */

const DONUT_R = 40;
const DONUT_C = 2 * Math.PI * DONUT_R;

function GenreDonut({ progress }: { progress: ProfileProgressRow[] }) {
  const counts = new Map<string, number>();
  for (const row of progress)
    for (const g of row.genres) counts.set(g, (counts.get(g) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return (
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold">Genres</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No genre data yet — genres backfill as you open detail pages.
        </p>
      </div>
    );
  }

  const top = ranked.slice(0, 5);
  const otherCount = ranked.slice(5).reduce((n, [, c]) => n + c, 0);
  const slices = [
    ...top.map(([name, count], i) => ({
      name,
      count,
      color: `var(--chart-${i + 1})`,
    })),
    ...(otherCount > 0
      ? [{ name: "Other", count: otherCount, color: "var(--muted)" }]
      : []),
  ];
  const total = slices.reduce((n, s) => n + s.count, 0);

  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = s.count / total;
    const arc = { ...s, dash: frac * DONUT_C, offset: acc * DONUT_C };
    acc += frac;
    return arc;
  });

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold">Genres</h3>
      <div className="mt-3 flex items-center gap-4">
        <svg
          viewBox="0 0 96 96"
          className="size-28 shrink-0"
          role="img"
          aria-label="Genre breakdown"
        >
          {arcs.map((a) => (
            <circle
              key={a.name}
              cx="48"
              cy="48"
              r={DONUT_R}
              fill="none"
              stroke={a.color}
              strokeWidth="13"
              strokeDasharray={`${a.dash} ${DONUT_C - a.dash}`}
              strokeDashoffset={-a.offset}
              transform="rotate(-90 48 48)"
            />
          ))}
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
          {arcs.map((a) => (
            <li key={a.name} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {a.count}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------- Status breakdown ---------------------------- */

function StatusBreakdown({ progress }: { progress: ProfileProgressRow[] }) {
  const counts = new Map<WatchStatus, number>();
  for (const row of progress)
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  const total = progress.length;
  const present = STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0);

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold">Status</h3>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
        {present.map((s) => (
          <div
            key={s}
            className={STATUS_BAR_COLOR[s]}
            style={{ width: `${((counts.get(s) ?? 0) / total) * 100}%` }}
            title={`${WATCH_STATUS_META[s].label}: ${counts.get(s)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {present.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${STATUS_BAR_COLOR[s]}`}
            />
            <span>{WATCH_STATUS_META[s].label}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {counts.get(s)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------- Activity heatmap ---------------------------- */

/** UTC calendar date (YYYY-MM-DD) for bucketing timestamps. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function heatLevel(count: number): string {
  if (count === 0) return "bg-muted/50";
  if (count === 1) return "bg-primary/25";
  if (count <= 3) return "bg-primary/50";
  if (count <= 6) return "bg-primary/75";
  return "bg-primary";
}

function ActivityHeatmap({ activity }: { activity: string[] }) {
  const perDay = new Map<string, number>();
  for (const ts of activity) {
    const key = dateKey(new Date(ts));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  // Sunday-aligned grid: columns are weeks (oldest → newest), rows are days.
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (HEATMAP_WEEKS * 7 - 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const cells: { key: string; count: number; future: boolean }[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < HEATMAP_WEEKS * 7; i++) {
    const key = dateKey(cursor);
    cells.push({
      key,
      count: perDay.get(key) ?? 0,
      future: cursor > today,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Episode activity</h3>
        <span className="text-xs text-muted-foreground">
          last {HEATMAP_WEEKS} weeks
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
          {cells.map((c) => (
            <div
              key={c.key}
              className={`size-2.5 rounded-[2px] ${
                c.future ? "bg-transparent" : heatLevel(c.count)
              }`}
              title={`${c.key}: ${c.count} episode${c.count === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

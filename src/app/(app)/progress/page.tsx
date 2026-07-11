import type { Metadata } from "next";

import { WrappedCard } from "@/components/progress/WrappedCard";
import { Card, CardContent } from "@/components/ui/card";
import { getUserStats, type UserStats } from "@/lib/user-stats";
import { requireUser } from "@/lib/supabase/auth";
import { WATCH_STATUS_META } from "@/lib/watch-status";
import { cn } from "@/lib/utils";
import type { WatchStatus } from "@/types/anime";

export const metadata: Metadata = {
  title: "My Progress · anime_maniacs",
  description: "Your watch statistics: episodes, hours, genres, and streaks.",
};

const TYPE_LABELS: Record<string, string> = {
  tv: "TV",
  movie: "Movie",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  music: "Music",
  unknown: "Other",
};

export default async function ProgressPage() {
  await requireUser();

  let stats: UserStats;
  try {
    stats = await getUserStats();
  } catch {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Header />
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load your stats right now. Please try again later.
        </p>
      </main>
    );
  }

  const hasActivity = stats.totalAnime > 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Header />

      {!hasActivity ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Add some anime to your library and start watching — your stats will
          show up here.
        </p>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Anime tracked" value={stats.totalAnime} />
            <StatTile label="Episodes watched" value={stats.episodesWatched} />
            <StatTile label="Hours watched" value={stats.hoursWatched} hint="est." />
            <StatTile
              label="Mean score"
              value={stats.meanScore != null ? `★ ${stats.meanScore}` : "—"}
            />
            <StatTile
              label="Current streak"
              value={stats.currentStreak}
              hint={stats.currentStreak === 1 ? "day" : "days"}
            />
            <StatTile
              label="Longest streak"
              value={stats.longestStreak}
              hint={stats.longestStreak === 1 ? "day" : "days"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Status breakdown */}
            <Panel title="Library by status">
              <BarList
                rows={(
                  Object.keys(WATCH_STATUS_META) as WatchStatus[]
                ).map((s) => ({
                  label: WATCH_STATUS_META[s].label,
                  count: stats.byStatus[s] ?? 0,
                }))}
                total={stats.totalAnime}
              />
            </Panel>

            {/* Format breakdown */}
            <Panel title="By format">
              <BarList
                rows={stats.byType.map((t) => ({
                  label: TYPE_LABELS[t.type] ?? t.type,
                  count: t.count,
                }))}
                total={stats.totalAnime}
              />
            </Panel>

            {/* Genres */}
            <Panel title="Top genres">
              {stats.topGenres.length === 0 ? (
                <Empty>
                  Genres appear as your library entries pick up catalog
                  metadata.
                </Empty>
              ) : (
                <BarList
                  rows={stats.topGenres.map((g) => ({
                    label: g.name,
                    count: g.count,
                  }))}
                  total={stats.topGenres[0]?.count ?? 1}
                  relative
                />
              )}
            </Panel>

            {/* Score distribution */}
            <Panel title="Your score distribution">
              {stats.scoreDist.every((n) => n === 0) ? (
                <Empty>Rate some anime to see your score spread.</Empty>
              ) : (
                <ScoreHistogram dist={stats.scoreDist} />
              )}
            </Panel>
          </div>

          {/* Fun facts */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {stats.bestDay ? (
              <FactCard
                title="Biggest binge day"
                body={`${formatDate(stats.bestDay.date)} — ${stats.bestDay.count} episodes in one day.`}
              />
            ) : null}
            {stats.firstActivity ? (
              <FactCard
                title="Tracking since"
                body={`Your first logged episode was on ${formatDate(stats.firstActivity)}.`}
              />
            ) : null}
          </div>

          {/* Anime Wrapped */}
          {stats.activeYears.length > 0 ? (
            <WrappedCard years={stats.activeYears} />
          ) : null}
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">My Progress</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything you&apos;ve watched, in numbers. Hours are estimated from
        typical runtimes.
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
          {hint ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-xs text-muted-foreground">{children}</p>;
}

/**
 * Horizontal bar rows. `total` is the denominator; with `relative` the widest
 * row fills the track (better for genre rankings than shares of the library).
 */
function BarList({
  rows,
  total,
  relative = false,
}: {
  rows: { label: string; count: number }[];
  total: number;
  relative?: boolean;
}) {
  const denom = Math.max(1, total);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
            {row.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full bg-primary", relative && "bg-primary/80")}
              style={{ width: `${Math.min(100, (row.count / denom) * 100)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums">
            {row.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScoreHistogram({ dist }: { dist: number[] }) {
  const max = Math.max(1, ...dist);
  return (
    <div className="flex h-28 items-end gap-1.5">
      {dist.map((count, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {count > 0 ? count : ""}
          </span>
          <div
            className="w-full rounded-t bg-primary/80"
            style={{ height: `${(count / max) * 80}px` }}
          />
          <span className="text-[10px] text-muted-foreground">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function FactCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="mt-1 text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

import Image from "next/image";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import type { AnimeType } from "@/types/anime";

type Variant = "grid" | "list";

const TYPE_LABEL: Record<AnimeType, string> = {
  tv: "TV",
  movie: "Movie",
  ova: "OVA",
  ona: "ONA",
  special: "Special",
  music: "Music",
};

/** Char-level longest common prefix of the titles, trimmed to a clean boundary. */
function commonTitlePrefix(titles: string[]): string {
  if (titles.length === 0) return "";
  let prefix = titles[0];
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  // Drop a dangling separator/partial word left by the cut (e.g. "Fate/" → "Fate").
  return prefix.replace(/[\s:–—\-_/]+$/u, "").trim();
}

type Entry = {
  id: string;
  title: string;
  poster_url: string | null;
  type: AnimeType;
  total_episodes: number | null;
  watched: number;
};

function pct(watched: number, total: number | null): number {
  return total && total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0;
}

/** Episodes watched, clamped to the entry's episode count so totals can't exceed 100%. */
function clampWatched(e: Entry): number {
  return e.total_episodes != null ? Math.min(e.watched, e.total_episodes) : e.watched;
}

/**
 * Async Server Component. Renders every anime sharing `franchiseId` as one
 * franchise unit: the earliest entry's poster as the cover, a derived franchise
 * title, aggregate watch progress, and a collapsible per-entry breakdown.
 *
 * Episodes-watched comes from the current user's `user_progress` rows (RLS
 * scopes the embed to them); untracked entries count as 0 watched. The
 * collapsible is the only interactive piece — it's a client component rendered
 * with server-built children.
 */
export async function FranchiseCard({
  franchiseId,
  variant = "grid",
}: {
  franchiseId: string;
  variant?: Variant;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anime")
    .select(
      "id, title, poster_url, type, total_episodes, airing_start, user_progress(episodes_watched)",
    )
    .eq("franchise_id", franchiseId)
    // NB: column is `airing_start` (there's no `aired_from`); nulls sort last.
    .order("airing_start", { ascending: true, nullsFirst: false });

  if (error || !data || data.length === 0) return null;

  const entries: Entry[] = data.map((e) => ({
    id: e.id,
    title: e.title,
    poster_url: e.poster_url,
    type: e.type,
    total_episodes: e.total_episodes,
    watched: e.user_progress[0]?.episodes_watched ?? 0,
  }));

  const cover = entries[0]; // earliest by air date
  const title = commonTitlePrefix(entries.map((e) => e.title)) || cover.title;
  const totalEpisodes = entries.reduce((s, e) => s + (e.total_episodes ?? 0), 0);
  const totalWatched = entries.reduce((s, e) => s + clampWatched(e), 0);
  const overallPct = pct(totalWatched, totalEpisodes);

  const poster = (sizes: string) =>
    cover.poster_url ? (
      <Image
        src={cover.poster_url}
        alt={title}
        fill
        sizes={sizes}
        className="object-cover"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        No image
      </div>
    );

  const progressSummary = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span className="tabular-nums">
          {totalWatched} / {totalEpisodes || "?"} ep
        </span>
      </div>
      <Progress value={overallPct} className="h-1.5" />
    </div>
  );

  const breakdown = (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <span>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5 text-xs">
              <Badge
                variant="outline"
                className="w-14 shrink-0 justify-center uppercase tracking-wide"
              >
                {TYPE_LABEL[e.type]}
              </Badge>
              <span className="flex-1 truncate" title={e.title}>
                {e.title}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {clampWatched(e)}/{e.total_episodes ?? "?"}
              </span>
              <Progress
                value={pct(e.watched, e.total_episodes)}
                className="h-1 w-16 shrink-0"
              />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );

  if (variant === "list") {
    return (
      <div className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md">
          {poster("64px")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h3>
          {progressSummary}
          {breakdown}
        </div>
      </div>
    );
  }

  // grid (card)
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {poster("(max-width: 768px) 50vw, 240px")}
        <Badge className="absolute right-2 top-2 border-transparent bg-black/70 text-white backdrop-blur">
          {entries.length} entries
        </Badge>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-white" title={title}>
            {title}
          </h3>
        </div>
      </div>
      <CardContent className="flex flex-col gap-3 p-3">
        {progressSummary}
        {breakdown}
      </CardContent>
    </Card>
  );
}

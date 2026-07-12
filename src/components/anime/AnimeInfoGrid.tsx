import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The "Information" grid on the anime detail page — a two-column list of facts
 * (format, status, episodes, rating, duration, season, author, air dates, day
 * of airing, country of origin, adult flag, studios, official site). Values
 * that aren't known are omitted, except End Date which shows "—" while airing.
 *
 * Presentational: the detail page assembles the values (merging our catalog
 * row, Jikan broadcast data, and AniList extras) and passes them in.
 */
export type AnimeInfo = {
  format: string | null;
  status: string | null;
  episodes: number | null;
  ratingText: string | null;
  durationText: string | null;
  season: string | null;
  author: string | null;
  startDate: string | null;
  endDate: string | null;
  /** True while the show is still airing (so a null End Date renders "—"). */
  airing: boolean;
  dayOfAiring: string | null;
  country: string | null;
  adult: boolean | null;
  studios: string[];
  officialSite: string | null;
};

type Row = { label: string; value: React.ReactNode };

/** Strip protocol/trailing slash for a compact official-site link label. */
function siteLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function AnimeInfoGrid({ info }: { info: AnimeInfo }) {
  const rows: Row[] = [];
  const push = (label: string, value: React.ReactNode) => {
    if (value != null && value !== "") rows.push({ label, value });
  };

  push("Format", info.format);
  push("Status", info.status);
  push("Episodes", info.episodes);
  push("Rating", info.ratingText);
  push("Duration", info.durationText);
  push("Season", info.season);
  push("Author", info.author);
  push("Start Date", info.startDate);
  // End Date: show "—" while airing even when unknown; otherwise only if known.
  push("End Date", info.endDate ?? (info.airing ? "—" : null));
  push("Day of Airing", info.dayOfAiring);
  push("Country", info.country);
  if (info.adult != null) push("Adult", info.adult ? "Yes" : "No");
  if (info.studios.length > 0) push("Studios", info.studios.join(", "));
  if (info.officialSite) {
    push(
      "Official Site",
      <a
        href={info.officialSite}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary hover:underline"
      >
        {siteLabel(info.officialSite)}
      </a>,
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Information</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0"
            >
              <dt className="shrink-0 text-sm text-muted-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 truncate text-right text-sm font-semibold text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

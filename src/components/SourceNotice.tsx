/**
 * Data-source notice shared by every surface with a fallback engine chain
 * (anime misc tab, manga search/home/detail). Renders the amber outage banner
 * when results came from the local catalog, a quiet attribution line when a
 * secondary engine (AniList / MangaDex) served them, and nothing when the
 * primary source (MAL) did. Server- and client-component safe (no hooks).
 */
export function SourceNotice({
  source,
  degraded,
  anilistLabel = "Results via AniList",
}: {
  /** Which engine served the data: "mal" | "anilist" | "mangadex" | "catalog". */
  source: string;
  /** True when live APIs were unreachable (local-catalog data). */
  degraded?: boolean;
  /** Attribution text for the AniList case (e.g. "Details via AniList"). */
  anilistLabel?: string;
}) {
  if (degraded || source === "catalog") {
    return (
      <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
        Live sources are unreachable — showing results from the local catalog
        until they recover.
      </p>
    );
  }
  if (source === "anilist" || source === "mangadex") {
    return (
      <p className="mb-4 text-center text-[11px] text-muted-foreground">
        {source === "mangadex"
          ? anilistLabel.replace("AniList", "MangaDex")
          : anilistLabel}
      </p>
    );
  }
  return null;
}

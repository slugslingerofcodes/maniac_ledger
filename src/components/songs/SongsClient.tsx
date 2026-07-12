"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Music2,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import {
  currentAnimeSeason,
  getSeasonThemes,
  getThemesByMalId,
  type ThemeTrack,
} from "@/lib/animethemes";
import { MusicVisualizer } from "@/components/songs/MusicVisualizer";
import { useDebounce } from "@/hooks/use-debounce";
import {
  displayTitle,
  useTitleLanguage,
} from "@/hooks/use-title-language";
import type { JikanAnime } from "@/lib/jikan";
import { cn } from "@/lib/utils";

type AnimePick = { malId: number; title: string; posterUrl: string | null };

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The /songs player: search an anime (or browse this season's simulcasts),
 * get its OP/ED themes from the AnimeThemes.moe archive, and play them in a
 * Spotify-style track list with a sticky transport bar. One shared <audio>
 * element drives everything.
 */
export function SongsClient() {
  const searchParams = useSearchParams();
  const malParam = searchParams.get("mal");
  const [titleLang] = useTitleLanguage();

  const [tracks, setTracks] = useState<ThemeTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceLabel, setSourceLabel] = useState("This season's themes");

  // Playback state; `current` indexes into `tracks`.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Anime search (through our own Jikan proxy).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [results, setResults] = useState<AnimePick[]>([]);

  /* ------------------------------ Data loads ----------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const malId = malParam != null ? Number(malParam) : NaN;
        const list = Number.isInteger(malId)
          ? await getThemesByMalId(malId)
          : await (() => {
              const { year, season } = currentAnimeSeason();
              return getSeasonThemes(year, season);
            })();
        if (cancelled) return;
        setTracks(list);
        if (Number.isInteger(malId)) {
          setSourceLabel(list[0]?.animeName ?? "Anime themes");
          if (list.length === 0)
            toast("No themes archived for this anime yet.");
        }
      } catch {
        if (!cancelled) toast.error("Couldn't reach the AnimeThemes archive.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [malParam]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        const list = ((body.results ?? []) as JikanAnime[])
          .slice(0, 8)
          .map((a) => ({
            malId: a.mal_id,
            title: displayTitle(titleLang, a.title, a.title_english),
            posterUrl: a.images?.jpg?.image_url ?? null,
          }));
        setResults(list);
      })
      .catch(() => {
        /* aborted or upstream down — dropdown just stays empty */
      });
    return () => controller.abort();
  }, [debouncedQuery, titleLang]);

  async function loadAnime(pick: AnimePick) {
    setQuery("");
    setResults([]);
    setLoading(true);
    try {
      const list = await getThemesByMalId(pick.malId);
      setTracks(list);
      setSourceLabel(pick.title);
      if (list.length === 0) toast("No themes archived for this anime yet.");
    } catch {
      toast.error("Couldn't reach the AnimeThemes archive.");
    } finally {
      setLoading(false);
    }
  }

  /* ------------------------------- Playback ------------------------------ */

  const currentTrack = current != null ? tracks[current] : undefined;

  // Point the shared <audio> at the selected track.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack?.audioUrl) return;
    audio.src = currentTrack.audioUrl;
    audio.play().catch(() => setPlaying(false));
  }, [currentTrack]);

  const playIndex = (i: number) => {
    if (i === current) {
      togglePlay();
      return;
    }
    setProgress(0);
    setDuration(0);
    setCurrent(i);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || current == null) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const step = (dir: 1 | -1) => {
    if (tracks.length === 0 || current == null) return;
    setProgress(0);
    setDuration(0);
    setCurrent((current + dir + tracks.length) % tracks.length);
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setProgress(value);
  };

  return (
    <div className="mt-6">
      {/* Anime search with a results dropdown */}
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an anime to hear its openings & endings…"
          aria-label="Search anime themes"
          className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {results.length > 0 ? (
          <ul className="absolute inset-x-0 top-12 z-30 overflow-hidden rounded-xl bg-popover ring-1 ring-border shadow-xl">
            {results.map((r) => (
              <li key={r.malId}>
                <button
                  type="button"
                  onClick={() => loadAnime(r)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div className="relative aspect-[2/3] w-7 shrink-0 overflow-hidden rounded bg-muted">
                    {r.posterUrl ? (
                      <Image
                        src={r.posterUrl}
                        alt=""
                        fill
                        sizes="28px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="line-clamp-1 text-sm">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Source heading */}
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h2 className="text-gradient line-clamp-1 text-lg font-semibold tracking-tight">
          {sourceLabel}
        </h2>
        {!loading ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {/* Track list */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading themes…
        </div>
      ) : tracks.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No playable themes here yet — try searching for an anime above.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border/60 rounded-xl bg-card/60 ring-1 ring-foreground/10">
          {tracks.map((t, i) => {
            const active = i === current;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => playIndex(i)}
                  className={cn(
                    "group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    active && "bg-primary/10",
                  )}
                >
                  <span className="grid w-6 shrink-0 place-items-center text-xs tabular-nums text-muted-foreground">
                    {active && playing ? (
                      <span aria-hidden className="text-primary">
                        ♪
                      </span>
                    ) : (
                      <>
                        <span className="group-hover:hidden">{i + 1}</span>
                        <Play
                          className="hidden size-3.5 group-hover:block"
                          aria-hidden
                        />
                      </>
                    )}
                  </span>
                  <div className="relative size-10 shrink-0 overflow-hidden rounded bg-muted">
                    {t.posterUrl ? (
                      <Image
                        src={t.posterUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <Music2
                        className="absolute inset-0 m-auto size-4 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "line-clamp-1 text-sm font-medium",
                        active && "text-primary",
                      )}
                    >
                      {t.songTitle}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {t.artists.length > 0 ? t.artists.join(", ") : "Unknown artist"}
                    </p>
                  </div>
                  <div className="hidden min-w-0 items-center gap-2 sm:flex">
                    <span className="line-clamp-1 max-w-48 text-xs text-muted-foreground">
                      {t.animeName}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                        t.themeSlug.startsWith("OP")
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-sky-500/15 text-sky-300",
                      )}
                    >
                      {t.themeSlug}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* Transport bar — sticky above the mobile tab bar */}
      {currentTrack ? (
        <div className="glass sticky bottom-20 z-30 mt-6 rounded-xl p-3 ring-1 ring-foreground/10 md:bottom-4">
          {/* Music visualizer — dances while a track plays, settles when paused. */}
          <MusicVisualizer
            playing={playing}
            className="mb-2.5 h-8 w-full rounded-md opacity-90"
          />
          <div className="flex items-center gap-3">
            <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
              {currentTrack.posterUrl ? (
                <Image
                  src={currentTrack.posterUrl}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              ) : (
                <Music2
                  className="absolute inset-0 m-auto size-5 text-muted-foreground"
                  aria-hidden
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold">
                {currentTrack.songTitle}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {currentTrack.themeSlug} · {currentTrack.animeName}
                </span>
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {fmtTime(progress)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={1}
                  value={Math.min(progress, duration || 1)}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="Seek"
                  className="h-1 flex-1 cursor-pointer accent-primary"
                />
                <span className="w-9 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {fmtTime(duration)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous track"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
              >
                <SkipBack className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
                className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90"
              >
                {playing ? (
                  <Pause className="size-4 fill-current" aria-hidden />
                ) : (
                  <Play className="size-4 translate-x-px fill-current" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next track"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
              >
                <SkipForward className="size-4" aria-hidden />
              </button>
            </div>
            <div className="hidden items-center gap-1.5 md:flex">
              <Volume2 className="size-4 text-muted-foreground" aria-hidden />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={1}
                onChange={(e) => {
                  if (audioRef.current)
                    audioRef.current.volume = Number(e.target.value);
                }}
                aria-label="Volume"
                className="h-1 w-20 cursor-pointer accent-primary"
              />
            </div>
          </div>
        </div>
      ) : null}

      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => step(1)}
        onError={() => {
          setPlaying(false);
          toast.error(
            "Couldn't play this track — the audio host may be blocked on your network, or this browser can't play .ogg audio.",
          );
        }}
        className="hidden"
      />
    </div>
  );
}

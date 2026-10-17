"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useLibraryActions } from "@/components/browse/library-state";
import { Parallax } from "@/components/Parallax";
import { PosterFallback } from "@/components/poster-fallback";
import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import type { BrowseItem, LibraryEntry } from "@/lib/browse-item";
import { nextBroadcastMs } from "@/lib/jst";
import { posterUrl } from "@/lib/poster";
import { cn } from "@/lib/utils";
import { WATCH_STATUS_META } from "@/lib/watch-status";

/** Serializable slide payload, built server-side from the top-airing chain. */
export type HeroSlide = BrowseItem & {
  durationMins: number | null;
  broadcastDay: string | null;
  broadcastTime: string | null;
  airing: boolean;
  /** YouTube id for the muted preview; null when the source had none. */
  trailerId: string | null;
};

/** How long a slide holds before advancing (also the progress bar's fill). */
const ADVANCE_MS = 9_000;
/** How long the banner must sit undisturbed before a trailer preview starts. */
const PREVIEW_IDLE_MS = 3_500;
/** YouTube shows a black frame and its own chrome while loading — wait it out. */
const PREVIEW_SETTLE_MS = 1_400;
/** Previews end on their own; the carousel then moves on. */
const PREVIEW_MAX_MS = 45_000;

const YT_ORIGIN = "https://www.youtube-nocookie.com";

/** Compact "3D 15H" / "15H 04M" countdown for the next-episode chip. */
function compactRemaining(untilMs: number): string | null {
  const diffMin = Math.floor((untilMs - Date.now()) / 60_000);
  if (diffMin < 0) return null;
  const days = Math.floor(diffMin / 1440);
  const hours = Math.floor((diffMin % 1440) / 60);
  const mins = diffMin % 60;
  return days > 0 ? `${days}D ${hours}H` : `${hours}H ${String(mins).padStart(2, "0")}M`;
}

/**
 * Whether this device should ever autoplay a preview: a wide, hover-capable
 * desktop, no reduced-motion preference, and no Save-Data. Phones never do —
 * a muted video is still megabytes of someone's data plan.
 */
function previewAllowed(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  const desktop = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection?.saveData;
  return desktop.matches && !reduced.matches && !saveData;
}

/**
 * The featured banner — the top of the home page.
 *
 * One title at a time from the top-airing chart: key art, title (with the
 * other-language title beneath it in Didot), score and format, genres, a short
 * synopsis, and the two things you'd do next — add it to your library, or open
 * it. It rotates on a progress strip; hovering, scrolling it away, switching
 * tabs or pressing pause all hold it.
 *
 * On a desktop that has lingered on a slide, a muted trailer can fade in over
 * the art (when the source carried one — MAL does, AniList doesn't). Never on
 * touch, under reduced motion, or with Save-Data on.
 *
 * Motion is split by library, never shared on one element: GSAP's `Parallax`
 * owns the ambient layer's transform, Framer owns opacity crossfades, and the
 * progress fill is a CSS animation whose `animationend` *is* the advance — so
 * pausing the bar pauses the carousel, with no timer to drift out of step.
 */
export function HeroCarousel(props: {
  slides: HeroSlide[];
  library?: Record<number, LibraryEntry>;
}) {
  if (props.slides.length === 0) return null;
  return <FeaturedBanner {...props} />;
}

function FeaturedBanner({
  slides,
  library = {},
}: {
  slides: HeroSlide[];
  library?: Record<number, LibraryEntry>;
}) {
  const [index, setIndex] = useState(0);
  // The first slide is server-rendered fully visible — it's the page's LCP
  // text, and it must not wait on hydration plus a fade to appear. Only slides
  // the carousel moves to animate in.
  const [moved, setMoved] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [docVisible, setDocVisible] = useState(true);
  // The trailer belongs to one slide: keyed by mal id, so moving on retires it
  // without an effect having to reset anything.
  const [trailer, setTrailer] = useState<{ malId: number; playing: boolean } | null>(null);
  const [muted, setMuted] = useState(true);
  const [titleLang] = useTitleLanguage();
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const count = slides.length;
  const slide = slides[index] ?? slides[0]!;
  const trailerActive = trailer != null && trailer.malId === slide.malId;
  const trailerPlaying = trailerActive && trailer.playing;
  const paused = hovered || userPaused || !inView || !docVisible || trailerActive;

  const { entry, pending, add } = useLibraryActions(slide, library[slide.malId] ?? null);

  // Hold the rotation while the banner is off screen or the tab is hidden.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([e]) => setInView(e?.isIntersecting ?? true), {
      threshold: 0.35,
    });
    io.observe(el);
    const onVis = () => setDocVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Countdown is computed client-side only (Date.now in render would differ
  // between server and client HTML). Refreshes each minute.
  useEffect(() => {
    const compute = () => {
      const at = slide.airing ? nextBroadcastMs(slide.broadcastDay, slide.broadcastTime) : null;
      setCountdown(at != null ? compactRemaining(at) : null);
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [slide]);

  // Idle → preview. Any disturbance (hover-out is fine; slide change, scroll
  // away, hidden tab) re-arms the wait through the dependencies.
  const slideId = slide.malId;
  const trailerId = slide.trailerId;
  useEffect(() => {
    if (!trailerId || userPaused || !inView || !docVisible) return;
    if (!previewAllowed()) return;
    const t = setTimeout(() => setTrailer({ malId: slideId, playing: false }), PREVIEW_IDLE_MS);
    return () => clearTimeout(t);
  }, [trailerId, slideId, userPaused, inView, docVisible]);

  // A preview that runs its course hands back to the carousel.
  useEffect(() => {
    if (!trailerActive) return;
    const t = setTimeout(() => {
      setTrailer(null);
      setMoved(true);
      setIndex((i) => (i + 1) % Math.max(count, 1));
    }, PREVIEW_MAX_MS);
    return () => clearTimeout(t);
  }, [trailerActive, count]);

  const title = displayTitle(titleLang, slide.title, slide.titleEnglish);
  const altTitle =
    slide.titleEnglish && slide.titleEnglish !== slide.title
      ? title === slide.title
        ? slide.titleEnglish
        : slide.title
      : null;
  const href = `/anime/mal/${slide.malId}`;

  const go = (next: number) => {
    setTrailer(null);
    setMoved(true);
    setIndex(((next % count) + count) % count);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: next ? "mute" : "unMute", args: [] }),
      YT_ORIGIN,
    );
  };

  const meta = [
    slide.type,
    slide.episodes != null ? `${slide.episodes} ep` : null,
    slide.durationMins != null ? `${slide.durationMins} min` : null,
    slide.studio,
  ].filter(Boolean);

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label="Featured anime"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="banner-height relative isolate overflow-hidden bg-banner text-banner-foreground"
    >
      {/* Ambient layer (md+): the key art blurred into colour behind
          everything. GSAP scrubs this wrapper's transform; Framer only fades
          the slides inside it. */}
      <div aria-hidden className="absolute inset-0 -z-10 hidden md:block">
        <Parallax className="absolute inset-0" distance={120} scale={1.2}>
          <AnimatePresence initial={false}>
            <m.div
              key={slide.malId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.7 }}
              className="absolute inset-0"
            >
              {slide.posterUrl ? (
                <Image
                  // Decorative and blurred to abstraction: the 100px
                  // rendition blurs to the same image as the 460px one.
                  src={posterUrl(slide.posterUrl, "blur")!}
                  alt=""
                  fill
                  sizes="100vw"
                  className="scale-110 object-cover opacity-70 blur-2xl"
                />
              ) : null}
            </m.div>
          </AnimatePresence>
        </Parallax>
      </div>

      {/* Muted trailer preview (desktop, after an idle wait). Scaled past the
          frame so YouTube's own chrome falls outside the crop. */}
      {trailerActive && slide.trailerId ? (
        <m.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: trailerPlaying ? 1 : 0 }}
          transition={{ duration: 0.8 }}
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <iframe
            ref={iframeRef}
            key={slide.trailerId}
            src={`${YT_ORIGIN}/embed/${slide.trailerId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${slide.trailerId}&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&enablejsapi=1`}
            title={`${title} trailer preview`}
            tabIndex={-1}
            allow="autoplay; encrypted-media"
            onLoad={() =>
              setTimeout(
                () => setTrailer((t) => (t && t.malId === slide.malId ? { ...t, playing: true } : t)),
                PREVIEW_SETTLE_MS,
              )
            }
            className="absolute left-1/2 top-1/2 aspect-video w-full -translate-x-1/2 -translate-y-1/2 scale-[1.35] border-0"
          />
        </m.div>
      ) : null}

      {/* Key art. One image, two layouts: full-bleed cover on phones (the
          poster *is* the banner there), a framed poster at the right on md+. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 md:inset-auto md:right-[var(--gutter)] md:top-1/2 md:aspect-[2/3] md:h-[78%] md:-translate-y-1/2"
      >
        <AnimatePresence initial={false}>
          <m.div
            key={slide.malId}
            initial={{ opacity: 0 }}
            animate={{ opacity: trailerPlaying ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.6 }}
            className="absolute inset-0 overflow-hidden md:rounded-xl md:shadow-2xl md:ring-1 md:ring-gold/40"
          >
            {slide.posterUrl ? (
              <Image
                src={slide.posterUrl}
                alt=""
                fill
                sizes="(min-width: 768px) 380px, 100vw"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="object-cover object-top"
              />
            ) : (
              <PosterFallback title={slide.title} />
            )}
          </m.div>
        </AnimatePresence>
      </div>

      {/* Scrims: bottom-up on phones (text sits on the art), left-to-right on
          md+ (text sits beside it). Ink, not black — the palette's own dark. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-banner from-30% via-banner/75 via-55% to-banner/10 md:bg-gradient-to-r md:from-banner md:from-25% md:via-banner/70 md:via-50% md:to-transparent"
      />
      {/* Dark mode only: melt the banner's foot into the page. In light mode
          the dark banner meets paper on a clean edge instead. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 hidden h-24 bg-gradient-to-t from-background to-transparent dark:block"
      />

      {/* Announce slide changes only when they're the viewer's doing: a
          rotating live region would talk over everything every nine seconds. */}
      <div
        aria-live={paused ? "polite" : "off"}
        className="row-gutter relative flex h-full flex-col justify-end pb-20 md:justify-center md:pb-12"
      >
        <m.div
          key={slide.malId}
          initial={reduce || !moved ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex max-w-xl flex-col gap-3 md:max-w-[min(36rem,52%)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            {slide.airing ? "Airing now" : "Featured"} · #{index + 1} top airing
          </p>

          <div>
            <h1 className="line-clamp-3 text-balance text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {altTitle ? (
              <p className="mt-1.5 line-clamp-1 font-didot text-lg italic text-banner-foreground/65">
                {altTitle}
              </p>
            ) : null}
          </div>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-banner-foreground/80">
            {slide.score != null ? (
              <span className="font-semibold text-gold">★ {slide.score.toFixed(1)}</span>
            ) : null}
            {meta.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 || slide.score != null ? (
                  <span aria-hidden className="text-banner-foreground/35">
                    ·
                  </span>
                ) : null}
                {part}
              </span>
            ))}
          </p>

          {slide.genres.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Genres">
              {slide.genres.slice(0, 4).map((g) => (
                <li
                  key={g}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-banner-foreground/25"
                >
                  {g}
                </li>
              ))}
            </ul>
          ) : null}

          {slide.synopsis ? (
            <p className="line-clamp-2 max-w-prose text-sm leading-relaxed text-banner-foreground/75 sm:line-clamp-3 sm:text-[15px]">
              {slide.synopsis}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            {entry ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-banner-foreground/12 px-5 text-sm font-semibold ring-1 ring-banner-foreground/25">
                <Check className="size-4 text-gold" aria-hidden />
                In library · {WATCH_STATUS_META[entry.status].label}
              </span>
            ) : (
              <button
                type="button"
                onClick={add}
                disabled={pending}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-banner disabled:opacity-70"
              >
                <Plus className="size-4" aria-hidden />
                Add to library
              </button>
            )}
            <Link
              href={href}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-banner-foreground/12 px-5 text-sm font-semibold ring-1 ring-banner-foreground/25 outline-none backdrop-blur transition-colors hover:bg-banner-foreground/20 focus-visible:ring-2 focus-visible:ring-gold"
            >
              <Info className="size-4" aria-hidden />
              Details
            </Link>
            {countdown ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-banner-foreground/75">
                <Clock className="size-3.5" aria-hidden />
                Next episode in {countdown}
              </span>
            ) : null}
          </div>
        </m.div>
      </div>

      {/* Rotation controls: segment strip (doubles as the timer), prev/next,
          pause, and — while a preview plays — sound. */}
      {count > 1 ? (
        <div className="row-gutter absolute inset-x-0 bottom-5 flex items-center justify-between gap-3 md:bottom-8">
          <div className="flex min-w-0 items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.malId}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show slide ${i + 1} of ${count}: ${displayTitle(titleLang, s.title, s.titleEnglish)}`}
                aria-current={i === index ? "true" : undefined}
                className="group/seg grid h-6 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span
                  className={cn(
                    "block h-1 overflow-hidden rounded-full bg-banner-foreground/25 transition-[width] group-hover/seg:bg-banner-foreground/45",
                    i === index ? "w-8 sm:w-10" : "w-3 sm:w-4",
                  )}
                >
                  {i === index ? (
                    <span
                      key={`${index}-${reduce ? "static" : "run"}`}
                      className={cn(
                        "block h-full origin-left rounded-full bg-gold",
                        reduce ? "scale-x-100" : "banner-progress",
                      )}
                      style={
                        reduce
                          ? undefined
                          : {
                              animationDuration: `${ADVANCE_MS}ms`,
                              animationPlayState: paused ? "paused" : "running",
                            }
                      }
                      onAnimationEnd={() => go(index + 1)}
                    />
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {trailerPlaying ? (
              <BannerIconButton label={muted ? "Unmute preview" : "Mute preview"} onClick={toggleMute}>
                {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
              </BannerIconButton>
            ) : null}
            {reduce ? null : (
              <BannerIconButton
                label={userPaused ? "Resume rotation" : "Pause rotation"}
                onClick={() => setUserPaused((p) => !p)}
              >
                {userPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
              </BannerIconButton>
            )}
            <BannerIconButton label="Previous slide" onClick={() => go(index - 1)}>
              <ChevronLeft className="size-5" aria-hidden />
            </BannerIconButton>
            <BannerIconButton label="Next slide" onClick={() => go(index + 1)}>
              <ChevronRight className="size-5" aria-hidden />
            </BannerIconButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BannerIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full bg-banner/50 ring-1 ring-banner-foreground/20 outline-none backdrop-blur transition-colors hover:bg-banner/80 focus-visible:ring-2 focus-visible:ring-gold"
    >
      {children}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Play,
  Star,
} from "lucide-react";

import { displayTitle, useTitleLanguage } from "@/hooks/use-title-language";
import { nextBroadcastMs } from "@/lib/jst";
import { cn } from "@/lib/utils";

/** Serializable slide payload, built server-side from Jikan records. */
export type HeroSlide = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  imageUrl: string | null;
  type: string | null;
  episodes: number | null;
  score: number | null;
  durationMins: number | null;
  genres: string[];
  studio: string | null;
  synopsis: string | null;
  broadcastDay: string | null;
  broadcastTime: string | null;
  airing: boolean;
};

const ADVANCE_MS = 8000;

/** Compact "3D 15H" / "15H 04M" countdown for the hero chip. */
function compactRemaining(untilMs: number): string | null {
  const diffMin = Math.floor((untilMs - Date.now()) / 60_000);
  if (diffMin < 0) return null;
  const days = Math.floor(diffMin / 1440);
  const hours = Math.floor((diffMin % 1440) / 60);
  const mins = diffMin % 60;
  return days > 0
    ? `${days}D ${hours}H`
    : `${hours}H ${String(mins).padStart(2, "0")}M`;
}

/** Shared dark-glass chip styling for hero meta/badges. */
const glassChip =
  "inline-flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1 text-xs font-semibold text-zinc-100 ring-1 ring-white/15 backdrop-blur";

/**
 * Streaming-style home hero: a full-bleed rotating showcase of the top airing
 * anime — blurred key art behind a countdown chip, slide counter, meta badges,
 * title, genre/studio chips, synopsis and Details / Watch Now actions.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [titleLang] = useTitleLanguage();
  const reduce = useReducedMotion();

  const count = slides.length;
  const slide = slides[index] ?? slides[0];

  // Auto-advance (paused under reduced motion); manual nav resets the timer
  // because `index` is a dependency.
  useEffect(() => {
    if (reduce || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [index, reduce, count]);

  // Countdown is computed client-side only (Date.now in render would differ
  // between server and client HTML). Refreshes each minute.
  useEffect(() => {
    if (!slide) return;
    const compute = () => {
      const at = slide.airing
        ? nextBroadcastMs(slide.broadcastDay, slide.broadcastTime)
        : null;
      setCountdown(at != null ? compactRemaining(at) : null);
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [slide]);

  if (!slide) return null;

  const title = displayTitle(titleLang, slide.title, slide.titleEnglish);
  const href = `/anime/mal/${slide.malId}`;
  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-zinc-950 text-zinc-50">
      {/* Backdrop: the slide's key art, blurred + darkened, crossfading. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.malId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.6 }}
            className="absolute inset-0"
          >
            {slide.imageUrl ? (
              <Image
                src={slide.imageUrl}
                alt=""
                fill
                priority={index === 0}
                sizes="100vw"
                className="scale-110 object-cover blur-md"
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-black/25 to-black/40" />
      </div>

      <div className="relative mx-auto flex min-h-[540px] w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-6">
        {/* Top row: next-episode countdown + slide controls */}
        <div className="flex items-start justify-between gap-3">
          {countdown ? (
            <span className={cn(glassChip, "px-4 py-2 text-sm tracking-wide")}>
              <Clock className="size-4" aria-hidden />
              NEXT EP {countdown}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous slide"
              className="grid size-9 place-items-center rounded-lg bg-black/45 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="flex h-9 min-w-16 items-center justify-center rounded-lg bg-black/45 px-3 text-sm font-bold tabular-nums ring-1 ring-white/15 backdrop-blur">
              {index + 1}
              <span className="sr-only"> of {count}</span>
              <span aria-hidden className="ml-1 text-xs font-semibold text-white/50">
                / {count}
              </span>
            </span>
            <button
              type="button"
              onClick={next}
              aria-label="Next slide"
              className="grid size-9 place-items-center rounded-lg bg-black/45 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Center: meta, title, chips, synopsis */}
        <motion.div
          key={slide.malId}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto my-auto flex max-w-2xl flex-col items-center gap-3 py-10 text-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {slide.type ? <span className={glassChip}>{slide.type}</span> : null}
            {slide.episodes != null ? (
              <span className={glassChip}>{slide.episodes} EP</span>
            ) : null}
            {slide.score != null ? (
              <span className={glassChip}>
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {Math.round(slide.score * 10)}
              </span>
            ) : null}
            {slide.durationMins != null ? (
              <span className={glassChip}>
                <Clock className="size-3.5" aria-hidden />
                {slide.durationMins} mins
              </span>
            ) : null}
          </div>

          <h1 className="text-gradient text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            {title}
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {slide.genres.length > 0 ? (
              <span className={glassChip}>{slide.genres.join(" · ")}</span>
            ) : null}
            {slide.studio ? <span className={glassChip}>{slide.studio}</span> : null}
          </div>

          {slide.synopsis ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-zinc-300 sm:text-[15px]">
              {slide.synopsis}
            </p>
          ) : null}

          {/* Actions inline on mobile; pinned bottom-right on md+ */}
          <div className="mt-3 flex items-center gap-3 md:hidden">
            <HeroActions href={href} />
          </div>
        </motion.div>

        <div className="absolute bottom-8 right-4 hidden items-center gap-3 sm:right-6 md:flex">
          <HeroActions href={href} />
        </div>
      </div>
    </section>
  );
}

function HeroActions({ href }: { href: string }) {
  return (
    <>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full bg-black/50 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70"
      >
        <Info className="size-4" aria-hidden />
        Details
      </Link>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-zinc-900 transition hover:bg-zinc-200"
      >
        <Play className="size-4 fill-current" aria-hidden />
        Watch now
      </Link>
    </>
  );
}

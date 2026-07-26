"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Eye centre and clock radius as fractions of the poster's own dimensions,
 * carried over from the Lively wallpaper's LivelyProperties.json (eyeX 399,
 * eyeY 705, size 56 — all /1000). Swapping the poster means re-measuring these.
 */
const EYE_X = 0.399;
const EYE_Y = 0.705;
const EYE_R = 0.056;

const POSTER_SRC = "/backgrounds/eye-clock.jpg";

export type EyeClockLayout = {
  /** Poster placement, pre-scale, in CSS pixels. */
  left: number;
  top: number;
  scale: number;
  /** Clock box: centre and radius, in CSS pixels. */
  centreX: number;
  centreY: number;
  radius: number;
};

/**
 * Focal cover-crop. Exported so it can be tested without a DOM: the failure it
 * guards — the clock drifting off the eye on some viewport shape — is silent,
 * and only shows up as a glowing dial floating on the character's cheek.
 */
export function eyeClockLayout(
  iw: number,
  ih: number,
  vw: number,
  vh: number,
): EyeClockLayout {
  const scale = Math.max(vw / iw, vh / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  // Bias the crop toward the eye, but clamp so the poster can never pull away
  // from an edge and leave a gap.
  const left = Math.min(0, Math.max(vw - dw, vw / 2 - EYE_X * dw));
  const top = Math.min(0, Math.max(vh - dh, vh / 2 - EYE_Y * dh));
  return {
    left,
    top,
    scale,
    centreX: left + EYE_X * dw,
    centreY: top + EYE_Y * dh,
    radius: EYE_R * dw,
  };
}

/**
 * "Eye Clock" ambient backdrop — the poster, with a live analogue clock sitting
 * inside the character's eye. Ported from the Lively desktop wallpaper.
 *
 * Two details carry over from the original and are load-bearing:
 *
 * - The crop is *focal*, not centred. A plain centred cover-crop pushes the eye
 *   off a portrait poster on a landscape screen, so the crop biases toward the
 *   eye and is clamped so the poster can never pull away from an edge.
 * - The hands are CSS animations on exact periods, phase-locked by a negative
 *   `animation-delay`. That delay is applied in an effect, never during render:
 *   the server cannot know the viewer's wall clock, so computing it in render
 *   would guarantee a hydration mismatch.
 */
export function EyeClockBackdrop() {
  const posterRef = useRef<HTMLImageElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<SVGGElement>(null);
  const minRef = useRef<SVGGElement>(null);
  const secRef = useRef<SVGGElement>(null);

  const layout = useCallback(() => {
    const poster = posterRef.current;
    const clock = clockRef.current;
    if (!poster || !clock) return;
    const iw = poster.naturalWidth;
    const ih = poster.naturalHeight;
    if (!iw || !ih) return;

    const { left, top, scale, centreX, centreY, radius } = eyeClockLayout(
      iw,
      ih,
      window.innerWidth,
      window.innerHeight,
    );

    poster.style.width = `${iw}px`;
    poster.style.height = `${ih}px`;
    poster.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;

    clock.style.width = `${radius * 2}px`;
    clock.style.height = `${radius * 2}px`;
    clock.style.left = `${centreX - radius}px`;
    clock.style.top = `${centreY - radius}px`;
  }, []);

  useEffect(() => {
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [layout]);

  useEffect(() => {
    function sync() {
      const d = new Date();
      const seconds = d.getSeconds() + d.getMilliseconds() / 1000;
      const minutes = d.getMinutes() * 60 + seconds;
      const hours = (d.getHours() % 12) * 3600 + minutes;
      const set = (el: SVGGElement | null, offset: number) => {
        if (el) el.style.animationDelay = `-${offset}s`;
      };
      set(hourRef.current, hours);
      set(minRef.current, minutes);
      set(secRef.current, seconds);
    }

    sync();
    // Re-lock on wake: a throttled tab lets CSS animations drift, and a clock
    // that is visibly wrong is worse than no clock.
    const onVisible = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(sync, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05070c]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- laid out by hand
          with a focal-crop transform; next/image can't express that. */}
      <img
        ref={posterRef}
        src={POSTER_SRC}
        alt=""
        onLoad={layout}
        className="absolute origin-top-left will-change-transform"
      />

      {/* Wallpaper scrim (its default 28%) plus a vignette. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_30%,rgba(3,6,12,0.75)_100%)]" />
      <div className="absolute inset-0 bg-[rgba(3,6,12,0.28)]" />

      {/* The clock. No z-index/will-change here: mix-blend-mode resolves
          against the nearest stacking context, which must stay the wrapper so
          the glow blends with the poster rather than with a bare backdrop. */}
      <div ref={clockRef} className="absolute">
        <svg viewBox="-50 -50 100 100" className="block h-full w-full overflow-visible">
          <defs>
            <radialGradient id="eye-iris">
              <stop offset="55%" stopColor="#35e0ff" stopOpacity="0" />
              <stop offset="88%" stopColor="#35e0ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8ff2ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="eye-seat">
              <stop offset="0%" stopColor="#02161f" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#02161f" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#02161f" stopOpacity="0" />
            </radialGradient>
            <filter id="eye-glow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Static only: the blur filter rasterises once, so putting the
              rotating arcs in here would re-render it every frame. */}
          <g filter="url(#eye-glow)" style={{ mixBlendMode: "screen" }}>
            <circle r="46" fill="url(#eye-iris)" />
            {Array.from({ length: 60 }, (_, i) => {
              const major = i % 5 === 0;
              return (
                <line
                  key={i}
                  x1="0"
                  x2="0"
                  y1="-40"
                  y2={major ? -35 : -37.8}
                  stroke={major ? "#8ff2ff" : "#35e0ff"}
                  strokeWidth={major ? 1.2 : 0.5}
                  strokeLinecap="round"
                  opacity={major ? 0.8 : 0.38}
                  transform={`rotate(${i * 6})`}
                />
              );
            })}
          </g>

          <g style={{ mixBlendMode: "screen" }}>
            <g className="eye-ring" opacity="0.5">
              <path d="M0-43 A43 43 0 0 1 30.4-30.4" fill="none" stroke="#8ff2ff" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M0 43 A43 43 0 0 1-30.4 30.4" fill="none" stroke="#8ff2ff" strokeWidth="1.1" strokeLinecap="round" />
            </g>
            <g className="eye-ring-rev" opacity="0.35">
              <path d="M37-18 A41 41 0 0 1 37 18" fill="none" stroke="#35e0ff" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 5" />
            </g>
          </g>

          <circle r="34" fill="url(#eye-seat)" />

          {/* Dark bodies with a light rim — legible on both the bright iris and
              the dark pupil. */}
          <g ref={hourRef} className="eye-hand eye-hour">
            <path d="M0 3.5 L-2.8 0 L0-20 L2.8 0 Z" fill="#04222e" stroke="#8ff2ff" strokeWidth="0.7" strokeLinejoin="round" opacity="0.95" />
          </g>
          <g ref={minRef} className="eye-hand eye-min">
            <path d="M0 4 L-1.9 0 L0-31 L1.9 0 Z" fill="#04222e" stroke="#8ff2ff" strokeWidth="0.6" strokeLinejoin="round" opacity="0.95" />
          </g>
          <g ref={secRef} className="eye-hand eye-sec">
            <line x1="0" y1="8" x2="0" y2="-37" stroke="#03202b" strokeWidth="1.9" strokeLinecap="round" opacity="0.7" />
            <line x1="0" y1="8" x2="0" y2="-37" stroke="#eafcff" strokeWidth="0.65" strokeLinecap="round" />
            <circle cy="-37" r="1.5" fill="#eafcff" />
          </g>

          <circle r="4.4" fill="#03161e" opacity="0.92" />
          <circle r="4.4" fill="none" stroke="#8ff2ff" strokeWidth="0.9" />
          <circle r="1.3" fill="#ffffff" />
        </svg>
      </div>

      {/* Extra readability veil — app content sits on top of this, which the
          desktop wallpaper never had to allow for. */}
      <div className="absolute inset-0 bg-background/35" />
    </div>
  );
}

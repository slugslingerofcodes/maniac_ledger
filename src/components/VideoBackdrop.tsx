"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed looping video backdrop — the motion alternative to the CSS
 * `VortexBackdrop`, fixed behind everything and dimmed by the same readability
 * veil so foreground text keeps its contrast.
 *
 * Ping-pong playback: instead of snapping back to frame 0 (a visible jump when
 * the last frame doesn't match the first), the clip rewinds and plays forward
 * again, so it reads as one continuous loop. `loop` is deliberately off — it
 * would swallow the `ended` event this hangs off.
 *
 * The rewind scrubs `currentTime` on rAF because no browser actually supports a
 * negative `playbackRate`; that makes reverse a seek-per-frame, which is why
 * the pass is capped at REWIND_RATE rather than run flat out.
 *
 * `playsInline` + `muted` are what let it autoplay at all: browsers block
 * sound-on autoplay outright, and iOS would otherwise go fullscreen. Under
 * reduced motion the video holds its first frame rather than being dropped, so
 * the user's choice still visibly applies.
 */

/** Rewind speed, relative to normal playback. */
const REWIND_RATE = 1;

export function VideoBackdrop({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      return;
    }

    let raf = 0;
    let lastTs = 0;

    function rewindStep(ts: number) {
      const v = ref.current;
      if (!v) return;
      const delta = lastTs ? ((ts - lastTs) / 1000) * REWIND_RATE : 0;
      lastTs = ts;
      const next = v.currentTime - delta;
      if (next <= 0) {
        // Back at the head — run it forward again.
        v.currentTime = 0;
        void v.play();
        return;
      }
      v.currentTime = next;
      raf = requestAnimationFrame(rewindStep);
    }

    function onEnded() {
      const v = ref.current;
      if (!v) return;
      v.pause();
      lastTs = 0;
      raf = requestAnimationFrame(rewindStep);
    }

    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("ended", onEnded);
      cancelAnimationFrame(raf);
    };
  }, [src]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base under the video: covers the gap before the first frame paints,
          and any letterboxing on odd aspect ratios. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,oklch(0.2_0.04_78),oklch(0.12_0.02_60)_58%,oklch(0.08_0.01_50))]" />

      <video
        key={src}
        ref={ref}
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Readability veil — identical to the vortex backdrop's, so switching
          backgrounds never changes how legible the content on top is. */}
      <div className="absolute inset-0 bg-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/45" />
    </div>
  );
}

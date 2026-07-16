"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed looping video backdrop — the motion alternative to the CSS
 * backdrops, fixed behind everything and dimmed by the same readability veil
 * so foreground text keeps its contrast.
 *
 * Plain `loop` playback: the clips in public/backgrounds/ are generated as
 * seamless loops (last frame matches the first), so the ping-pong rewind the
 * previous incarnation of this component needed is gone with them.
 *
 * `playsInline` + `muted` are what let it autoplay at all: browsers block
 * sound-on autoplay outright, and iOS would otherwise go fullscreen. Under
 * reduced motion the video holds its first frame rather than being dropped,
 * so the user's choice still visibly applies.
 */
export function VideoBackdrop({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
    }
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <video
        ref={ref}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="size-full object-cover"
      />
      {/* Readability veil — same recipe as the CSS backdrops. */}
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-background/60" />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * A decorative bar-graph music visualizer for the /songs transport bar.
 *
 * It deliberately does NOT tap the actual audio stream: the theme audio is
 * served cross-origin from the AnimeThemes CDN, and routing a cross-origin
 * <audio> through the Web Audio API taints the graph — which silences
 * playback when the host doesn't send CORS headers. So instead the bars are
 * driven by layered sine waves + a little noise, with an "energy" envelope
 * that rises while `playing` and eases back to a gentle idle when paused.
 * Looks music-reactive, never risks the audio.
 *
 * Canvas 2D, DPR-aware, ResizeObserver-driven, and static under
 * prefers-reduced-motion.
 */
export function MusicVisualizer({
  playing,
  className,
}: {
  playing: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  const energyRef = useRef(0);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const BARS = 56;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const phases = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2);

    const barAt = (i: number, t: number, energy: number) => {
      const s1 = 0.5 + 0.5 * Math.sin(t * 0.14 + phases[i]! + i * 0.28);
      const s2 = 0.5 + 0.5 * Math.sin(t * 0.32 + i * 0.6);
      const noise = 0.85 + 0.15 * Math.random();
      // Center bars a touch taller (bass-in-the-middle look).
      const centerBias = 0.7 + 0.3 * Math.sin((i / (BARS - 1)) * Math.PI);
      return energy * (s1 * 0.6 + s2 * 0.4) * noise * centerBias;
    };

    const paint = (t: number, energy: number) => {
      ctx.clearRect(0, 0, w, h);
      const gap = 2;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const amp = barAt(i, t, energy);
        const bh = Math.max(2, amp * h);
        const x = i * (bw + gap);
        const y = h - bh;
        // Violet → teal gradient across the row, brighter with amplitude.
        const hue = 268 - (i / BARS) * 96;
        ctx.fillStyle = `hsl(${hue}, 92%, ${52 + amp * 22}%)`;
        ctx.fillRect(x, y, bw, bh);
      }
    };

    if (reduce) {
      paint(0, 0.14);
      return () => ro.disconnect();
    }

    let t = 0;
    let raf = 0;
    const tick = () => {
      const target = playingRef.current ? 1 : 0.08;
      energyRef.current += (target - energyRef.current) * 0.08;
      paint(t, energyRef.current);
      t += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (raf === 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}

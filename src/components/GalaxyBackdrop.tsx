"use client";

import { useEffect, useRef } from "react";

/**
 * A 3D galaxy backdrop for the anime detail pages: a perspective starfield
 * (stars stream outward from a vanishing point, growing as they approach, so
 * you feel like you're flying through space) layered over a deep-space nebula
 * gradient with a slow parallax swirl. Canvas 2D — no WebGL/three.js, so it's
 * light and dependency-free.
 *
 * Fixed, behind everything, pointer-events-none. Honors prefers-reduced-motion
 * by rendering a single static frame. Pauses when the tab is hidden.
 */

type Star = { x: number; y: number; z: number; hue: number };

const STAR_COUNT = 480;
const SPEED = 0.0034;

export function GalaxyBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let cx = 0;
    let cy = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      cx = width / 2;
      cy = height / 2;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Galaxy palette: mostly cool blue-violet with occasional warm/teal stars.
    const makeStar = (): Star => ({
      x: (Math.random() * 2 - 1) * width,
      y: (Math.random() * 2 - 1) * height,
      z: Math.random(),
      hue:
        Math.random() < 0.15
          ? 40 + Math.random() * 20 // warm gold sprinkle
          : 220 + Math.random() * 70, // blue → violet
    });

    resize();
    const stars: Star[] = Array.from({ length: STAR_COUNT }, makeStar);

    let angle = 0;

    const drawNebula = () => {
      // Deep-space base with two off-center nebula glows.
      ctx.fillStyle = "#05060d";
      ctx.fillRect(0, 0, width, height);

      const g1 = ctx.createRadialGradient(
        cx * 0.7,
        cy * 0.6,
        0,
        cx * 0.7,
        cy * 0.6,
        Math.max(width, height) * 0.7,
      );
      g1.addColorStop(0, "rgba(112, 72, 230, 0.42)");
      g1.addColorStop(1, "rgba(112, 72, 230, 0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      const g2 = ctx.createRadialGradient(
        cx * 1.3,
        cy * 1.4,
        0,
        cx * 1.3,
        cy * 1.4,
        Math.max(width, height) * 0.6,
      );
      g2.addColorStop(0, "rgba(36, 168, 190, 0.34)");
      g2.addColorStop(1, "rgba(36, 168, 190, 0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);
    };

    const drawStars = () => {
      ctx.save();
      // Slow rotational parallax gives the field a galactic swirl.
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.translate(-cx, -cy);
      ctx.globalCompositeOperation = "lighter";

      for (const s of stars) {
        const k = 128 / s.z; // perspective scale
        const px = cx + (s.x * k) / 128;
        const py = cy + (s.y * k) / 128;
        if (px < -50 || px > width + 50 || py < -50 || py > height + 50) {
          continue;
        }
        const size = Math.max(0.2, (1 - s.z) * 2.6);
        const alpha = Math.min(1, (1 - s.z) * 1.2);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 90%, 78%, ${alpha})`;
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    };

    const render = () => {
      drawNebula();
      drawStars();
    };

    let raf = 0;
    const tick = () => {
      for (const s of stars) {
        s.z -= SPEED;
        if (s.z <= 0.02) {
          const ns = makeStar();
          s.x = ns.x;
          s.y = ns.y;
          s.z = 1;
          s.hue = ns.hue;
        }
      }
      angle += 0.0006;
      render();
      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      resize();
      if (reduce) render();
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!reduce && raf === 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) {
      render();
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {/* Light readability veil — kept low so the galaxy stays clearly visible;
          the content cards carry their own bg for legibility. */}
      <div className="absolute inset-0 bg-background/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-background/25" />
    </div>
  );
}

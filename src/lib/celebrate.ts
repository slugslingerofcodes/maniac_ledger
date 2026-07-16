"use client";

import { toast } from "sonner";

/**
 * Toast + confetti burst for completing a series — shared by the episode
 * checklist (marking the finale) and the progress sidebar (flipping status to
 * completed), so finishing feels the same however you record it.
 *
 * The confetti chunk is dynamically imported and skipped entirely under
 * reduced motion — no burst, and no loading its code at all.
 */
export async function celebrateCompletion(
  message = "Series complete — every episode watched! 🎉",
) {
  toast.success(message);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 130,
    spread: 75,
    origin: { y: 0.7 },
    disableForReducedMotion: true,
  });
}

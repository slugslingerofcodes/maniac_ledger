"use client";

import { VideoBackdrop } from "@/components/VideoBackdrop";
import { VortexBackdrop } from "@/components/VortexBackdrop";
import { BACKGROUND_VIDEO, useBackground } from "@/hooks/use-background";

/**
 * The ambient app background, honouring the user's choice from the profile
 * page: "default" keeps the CSS vortex, the rest play their video.
 *
 * Everything renders behind content at -z-10 with the same veil, so the pick is
 * purely cosmetic — no layout or legibility changes either way. Pages with a
 * deliberate, content-driven backdrop (the /library poster wall, /search's
 * scene) keep theirs; this only stands in for the ambient one.
 */
export function AmbientBackdrop() {
  const [choice] = useBackground();
  const video = BACKGROUND_VIDEO[choice];
  return video ? <VideoBackdrop src={video} /> : <VortexBackdrop />;
}

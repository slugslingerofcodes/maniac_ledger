"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { LeatherBackdrop } from "@/components/LeatherBackdrop";
import { VortexBackdrop } from "@/components/VortexBackdrop";
import {
  BACKGROUND_VIDEO,
  useBackground,
  useCustomBackgroundImage,
} from "@/hooks/use-background";

/**
 * Only one backdrop is ever on screen, but importing all five statically made
 * every route download all five — the galaxy's particle field, the eye clock,
 * the poster wall and the video player, on pages that render none of them.
 *
 * Vortex stays a static import because it is the default for most routes, so
 * lazy-loading it would only add a round trip before the common case paints.
 * The rest are `ssr: false`: each is a decorative, client-only canvas whose
 * server render is an empty fixed div anyway.
 */
const EyeClockBackdrop = dynamic(
  () => import("@/components/EyeClockBackdrop").then((m) => m.EyeClockBackdrop),
  { ssr: false },
);
const GalaxyBackdrop = dynamic(
  () => import("@/components/GalaxyBackdrop").then((m) => m.GalaxyBackdrop),
  { ssr: false },
);
const SearchPosterWall = dynamic(
  () => import("@/components/search/SearchPosterWall").then((m) => m.SearchPosterWall),
  { ssr: false },
);
const VideoBackdrop = dynamic(
  () => import("@/components/VideoBackdrop").then((m) => m.VideoBackdrop),
  { ssr: false },
);

/**
 * The app-wide backdrop behind the (app) and manga routes — the single place
 * that decides what renders back there. Pages must not render a backdrop
 * themselves: the layout mounts this behind every route, so a page-level
 * backdrop would stack a second fixed layer on top of it.
 *
 * Two kinds of choice (see `useBackground`), and the difference matters:
 *
 * - **Takeover choices** — a motion video, the eye clock, or the user's own
 *   picture — replace everything, app-wide. Picking one is a statement that
 *   you want *that*, everywhere.
 * - **Ambient choices** — "Blue leather" (the default) and "Scenes" — are
 *   path-aware, and differ from each other only on general pages. The routes
 *   with a backdrop of their own keep it either way: /library supplies its own
 *   trending-poster wall (render nothing), /cosmos paints its own deep space,
 *   /search gets the cinematic poster wall, and /anime/* gets the galaxy.
 *   Those are part of what those pages *are*, not ambient decoration, so a
 *   preference about the quiet background behind everything else has no
 *   business switching them off.
 */
export function AppBackdrop() {
  const pathname = usePathname();
  const [choice] = useBackground();
  const [customImage] = useCustomBackgroundImage();

  const video = BACKGROUND_VIDEO[choice];
  if (video) return <VideoBackdrop src={video} />;
  if (choice === "eyeclock") return <EyeClockBackdrop />;
  if (choice === "custom" && customImage) {
    return <CustomImageBackdrop src={customImage} />;
  }

  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  // /cosmos paints its own deep-space wash under a WebGL scene — a second
  // animated layer behind it would only burn frames nobody sees.
  if (pathname === "/cosmos") {
    return null;
  }
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return <SearchPosterWall />;
  }
  if (pathname.startsWith("/anime/")) {
    return <GalaxyBackdrop />;
  }
  // The general-page backdrop — the one slot the two ambient choices actually
  // disagree about. Leather is the default; "Scenes" keeps the animated vortex.
  return choice === "leather" ? <LeatherBackdrop fixed /> : <VortexBackdrop />;
}

/**
 * The user's own picture as the backdrop. A plain CSS background rather than
 * next/image: the source is a data URL from localStorage, which next/image
 * won't accept as a remote pattern. Same readability veil as the others.
 */
function CustomImageBackdrop({ src }: { src: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-background/60" />
    </div>
  );
}

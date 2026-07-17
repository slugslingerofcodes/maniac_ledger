"use client";

import { usePathname } from "next/navigation";

import { GalaxyBackdrop } from "@/components/GalaxyBackdrop";
import { SearchPosterWall } from "@/components/search/SearchPosterWall";
import { VideoBackdrop } from "@/components/VideoBackdrop";
import { VortexBackdrop } from "@/components/VortexBackdrop";
import {
  BACKGROUND_VIDEO,
  useBackground,
  useCustomBackgroundImage,
} from "@/hooks/use-background";

/**
 * The app-wide backdrop behind the (app) and manga routes — the single place
 * that decides what renders back there. Pages must not render a backdrop
 * themselves: the layout mounts this behind every route, so a page-level
 * backdrop would stack a second fixed layer on top of it.
 *
 * The user's profile choice (see `useBackground`) wins: a motion video or
 * their own picture replaces everything, app-wide. On "default" the choice is
 * path-aware: /library supplies its own trending-poster backdrop (render
 * nothing), /search gets the cinematic Netflix-style poster wall, /anime/* gets
 * the galaxy, and everywhere else the animated "Great Sage" vortex.
 */
export function AppBackdrop() {
  const pathname = usePathname();
  const [choice] = useBackground();
  const [customImage] = useCustomBackgroundImage();

  const video = BACKGROUND_VIDEO[choice];
  if (video) return <VideoBackdrop src={video} />;
  if (choice === "custom" && customImage) {
    return <CustomImageBackdrop src={customImage} />;
  }

  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return <SearchPosterWall />;
  }
  if (pathname.startsWith("/anime/")) {
    return <GalaxyBackdrop />;
  }
  return <VortexBackdrop />;
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

"use client";

import { usePathname } from "next/navigation";

import { SearchPosterWall } from "@/components/search/SearchPosterWall";
import { VortexBackdrop } from "@/components/VortexBackdrop";

/**
 * The app-wide backdrop behind the (app) tabs. Path-aware: /library supplies
 * its own trending-poster backdrop (render nothing), /search gets the
 * cinematic Netflix-style scene, and everywhere else shows the animated
 * "Great Sage" vortex.
 */
export function AppBackdrop() {
  const pathname = usePathname();
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return <SearchPosterWall />;
  }
  return <VortexBackdrop />;
}

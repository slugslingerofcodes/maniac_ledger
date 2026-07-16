"use client";

import { usePathname } from "next/navigation";

import { AmbientBackdrop } from "@/components/AmbientBackdrop";
import { SearchPosterWall } from "@/components/search/SearchPosterWall";

/**
 * The app-wide backdrop behind the (app) tabs. Path-aware: /library supplies
 * its own trending-poster backdrop (render nothing), /search gets the
 * cinematic Netflix-style scene, and everywhere else shows the ambient
 * backdrop the user picked in their profile (vortex by default).
 */
export function AppBackdrop() {
  const pathname = usePathname();
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return <SearchPosterWall />;
  }
  return <AmbientBackdrop />;
}

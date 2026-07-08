"use client";

import { usePathname } from "next/navigation";

import { RaphaelBackdrop } from "@/components/RaphaelBackdrop";

/**
 * The app-wide backdrop behind the (app) tabs. Path-aware: on /library it
 * renders nothing, because that page supplies its own trending-poster backdrop;
 * everywhere else it shows the animated "Great Sage" scene.
 */
export function AppBackdrop() {
  const pathname = usePathname();
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  return <RaphaelBackdrop />;
}

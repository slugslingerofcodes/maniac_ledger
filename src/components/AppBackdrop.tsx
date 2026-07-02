"use client";

import { usePathname } from "next/navigation";

import { ImageBackdrop } from "@/components/ImageBackdrop";

/**
 * The app-wide backdrop behind the (app) tabs. Path-aware: on /library it
 * renders nothing, because that page supplies its own trending-poster backdrop;
 * everywhere else it shows the golden image backdrop.
 */
export function AppBackdrop() {
  const pathname = usePathname();
  if (pathname === "/library" || pathname.startsWith("/library/")) {
    return null;
  }
  return (
    <ImageBackdrop
      src="/app-bg.webp"
      fixed
      overlay={<div className="absolute inset-0 bg-background/85" />}
    />
  );
}

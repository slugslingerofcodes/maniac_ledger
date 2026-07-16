import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AppBackdrop } from "@/components/AppBackdrop";
import { CommandPalette } from "@/components/CommandPalette";
import { MangaBottomTabBar } from "@/components/manga/MangaBottomTabBar";
import { MangaNav } from "@/components/manga/MangaNav";

/**
 * Manga-framework layout — mirrors the anime (app) layout so both sides share
 * the same look: the animated vortex backdrop, glass sticky nav, announcement
 * banner, and a mobile bottom tab bar. No bg-background on the wrapper: the
 * fixed backdrop sits at -z-10 and an opaque background would cover it.
 */
export default function MangaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col text-foreground">
      <AppBackdrop />
      <MangaNav />
      <CommandPalette />
      <AnnouncementBanner />
      {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <MangaBottomTabBar />
    </div>
  );
}

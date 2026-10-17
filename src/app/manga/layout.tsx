import { Suspense, type ReactNode } from "react";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AppBackdrop } from "@/components/AppBackdrop";
import { CommandPalette } from "@/components/CommandPalette";
import { MangaBottomTabBar } from "@/components/manga/MangaBottomTabBar";
import { MangaNav } from "@/components/manga/MangaNav";
import { MotionProvider } from "@/components/MotionProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getNavUser } from "@/lib/nav-user-server";

/**
 * Manga-framework layout — mirrors the anime (app) layout so both sides share
 * the same look: the animated vortex backdrop, glass sticky nav, announcement
 * banner, and a mobile bottom tab bar. No bg-background on the wrapper: the
 * fixed backdrop sits at -z-10 and an opaque background would cover it.
 */
export default function MangaLayout({ children }: { children: ReactNode }) {
  return (
    // Shared tooltip delay, as in the (app) layout — mounted per framework
    // rather than in the root so the auth pages don't download it.
    <TooltipProvider>
      {/* framer-motion features for every `m.*` below, loaded after hydration. */}
      <MotionProvider>
        <div className="relative flex min-h-screen flex-col text-foreground">
          <AppBackdrop />
          <MangaNav user={getNavUser()} />
          <CommandPalette />
          <Suspense fallback={null}>
            <AnnouncementBanner />
          </Suspense>
          {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
          <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
          <MangaBottomTabBar />
        </div>
      </MotionProvider>
    </TooltipProvider>
  );
}

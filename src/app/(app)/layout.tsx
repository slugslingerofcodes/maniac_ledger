import { Suspense, type ReactNode } from "react";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AppNav } from "@/components/AppNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { CommandPalette } from "@/components/CommandPalette";
import { MotionProvider } from "@/components/MotionProvider";
import { GettingStarted } from "@/components/onboarding/GettingStarted";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getNavUser } from "@/lib/nav-user-server";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Shared tooltip delay: once one icon's tooltip is open, hovering the next
    // one in a toolbar shows instantly. Mounted here and in the manga layout
    // (not the root) so the auth pages don't download it.
    <TooltipProvider>
      {/* framer-motion features for every `m.*` below, loaded after hydration. */}
      <MotionProvider>
        <div className="relative flex min-h-screen flex-col text-foreground">
          {/* App-wide backdrop; path-aware (library uses its own poster wall). */}
          <AppBackdrop />
          <AppNav user={getNavUser()} />
          <CommandPalette />
          <Suspense fallback={null}>
            <AnnouncementBanner />
          </Suspense>
          {/* First-run guidance. Self-retiring — renders nothing once the library
              has a single entry — and streamed so its probe never delays the page. */}
          <Suspense fallback={null}>
            <GettingStarted />
          </Suspense>
          {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
          <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </div>
          <BottomTabBar />
        </div>
      </MotionProvider>
    </TooltipProvider>
  );
}

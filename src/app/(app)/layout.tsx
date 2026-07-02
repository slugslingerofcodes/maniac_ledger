import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AppNav } from "@/components/AppNav";
import { BottomTabBar } from "@/components/BottomTabBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col text-foreground">
      {/* App-wide backdrop; path-aware (library uses its own poster wall). */}
      <AppBackdrop />
      <AppNav />
      <AnnouncementBanner />
      {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <BottomTabBar />
    </div>
  );
}

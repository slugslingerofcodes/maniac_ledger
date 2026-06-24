import type { ReactNode } from "react";

import { AppNav } from "@/components/AppNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ImageBackdrop } from "@/components/ImageBackdrop";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col text-foreground">
      {/* App-wide backdrop behind every tab (library/search/recommendations…). */}
      <ImageBackdrop
        src="/app-bg.webp"
        fixed
        overlay={<div className="absolute inset-0 bg-background/85" />}
      />
      <AppNav />
      {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <BottomTabBar />
    </div>
  );
}

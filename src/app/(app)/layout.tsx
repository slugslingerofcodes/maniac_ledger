import type { ReactNode } from "react";

import { AppNav } from "@/components/AppNav";
import { BottomTabBar } from "@/components/BottomTabBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppNav />
      {/* Bottom padding on mobile so the fixed tab bar doesn't cover content. */}
      <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <BottomTabBar />
    </div>
  );
}

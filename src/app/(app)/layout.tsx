import type { ReactNode } from "react";

import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppNav />
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Admin · anime_maniacs",
  robots: { index: false, follow: false },
};

/**
 * Minimal admin shell — no user nav or backdrop. Deliberately does NOT guard
 * here (the /admin/login child must stay reachable by non-admins); each page
 * calls requireAdmin() itself.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}

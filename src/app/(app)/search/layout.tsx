import type { ReactNode } from "react";

import { requireUser } from "@/lib/supabase/auth";

/**
 * Server-side gate for /search.
 *
 * `page.tsx` here is a Client Component, so it can't guard itself — a Client
 * Component may not be `async`, and there is nothing to await in one anyway.
 * A layout is the seam that works: it renders on the server around the client
 * page, so the redirect happens before any of it is sent.
 *
 * This exists because the route previously relied on the proxy redirect alone,
 * and Next has shipped repeated middleware/proxy-bypass advisories. The gate
 * belongs somewhere a framework bug can't skip.
 */
export default async function SearchLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}

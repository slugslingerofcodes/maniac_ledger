import type { ReactNode } from "react";

import { requireUser } from "@/lib/supabase/auth";

/**
 * Server-side gate for the 18+ section.
 *
 * `page.tsx` here is a Client Component, so it cannot guard itself — and this
 * route previously relied on the proxy redirect alone. That is the weakest
 * place in the app to depend on middleware: Next has shipped multiple
 * proxy-bypass advisories, and a bypass here isn't a data leak but an
 * *age-gate* bypass, which is a different kind of problem.
 *
 * A layout is the right seam: it renders on the server around the client page,
 * so the redirect happens before any adult content is fetched or sent. The
 * localStorage "I am 18+" confirmation inside the page is a UX affordance, not
 * a control — it never was one, and nothing here treats it as such.
 */
export default async function MiscellaneousLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return <>{children}</>;
}

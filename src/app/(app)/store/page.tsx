import type { Metadata } from "next";

import { RequestButton } from "@/components/store/RequestButton";
import { getMyPendingProductIds, getStoreProducts } from "@/app/actions/store";
import { formatPrice } from "@/lib/price";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Store · anime_maniacs",
  description: "Browse merch and request items.",
};

/**
 * The store: any signed-in user can browse the products admins have added and
 * request an item. Requests land on the admin dashboard. Products and requests
 * are RLS-scoped (browse-all for products, own-requests for users).
 */
export default async function StorePage() {
  await requireUser();
  const [{ products, available }, pendingIds] = await Promise.all([
    getStoreProducts(),
    getMyPendingProductIds(),
  ]);
  const pending = new Set(pendingIds);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Store</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Merch and goodies. See something you want? Send a request and the team
          will get back to you.
        </p>
      </div>

      {!available ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          The store isn&apos;t set up yet — the store migration (0021) hasn&apos;t
          been applied to the database.
        </p>
      ) : products.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing in the store yet. Check back soon!
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                {!p.available ? (
                  <span className="absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">
                    Sold out
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                  {p.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  ) : null}
                </div>
                <p className="text-base font-semibold text-primary">
                  {formatPrice(p.price)}
                </p>
                <RequestButton
                  productId={p.id}
                  available={p.available}
                  initialRequested={pending.has(p.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

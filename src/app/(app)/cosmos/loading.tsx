import { Skeleton } from "@/components/ui/skeleton";

/**
 * Cosmos skeleton. The page is a full-bleed poster mosaic on a near-black
 * field, so the placeholder is a tile grid on the same black rather than the
 * usual card layout — otherwise the shell would flash light before the scene
 * takes over.
 */
export default function Loading() {
  return (
    <div className="relative flex flex-1 flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[#0a0a0a]" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <Skeleton className="h-6 w-36 bg-white/10" />
          <Skeleton className="mt-2 h-3 w-52 bg-white/10" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full bg-white/10" />
      </div>

      {/* The mosaic itself — dim tiles packed edge to edge, like the real one. */}
      <div className="grid flex-1 grid-cols-4 gap-1 p-1 sm:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 32 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-[2/3] w-full rounded-sm bg-white/[0.06]"
          />
        ))}
      </div>
    </div>
  );
}

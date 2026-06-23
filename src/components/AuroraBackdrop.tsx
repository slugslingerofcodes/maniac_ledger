import { cn } from "@/lib/utils";

/**
 * Decorative animated "aurora" backdrop — a few slowly drifting, blurred color
 * blobs over the dark theme. Pure CSS (keyframes in globals.css), no assets, so
 * it works offline and respects prefers-reduced-motion. Render it as the first
 * child of a `relative overflow-hidden` container; content stacks above it.
 */
export function AuroraBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
    >
      <div
        className="aurora-blob aurora-blob-1 left-[-10%] top-[-20%] h-[60vh] w-[60vh]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.62 0.21 264 / 0.9), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob aurora-blob-2 right-[-12%] top-[6%] h-[52vh] w-[52vh]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.58 0.17 215 / 0.85), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob aurora-blob-3 bottom-[-22%] left-[18%] h-[48vh] w-[48vh]"
        style={{
          background:
            "radial-gradient(circle, oklch(0.55 0.23 300 / 0.8), transparent 70%)",
        }}
      />
    </div>
  );
}

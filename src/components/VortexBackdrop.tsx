/**
 * Ambient app backdrop: the vortex artwork (public/vortex.png) as a living
 * layer — an oversized square slowly rotates while an inner layer breathes.
 * Behind it, a CSS "temporal rune vortex" (rotating rune rings + pulsing core +
 * teal/gold bokeh) acts as a graceful fallback so the backdrop still animates
 * if the image file is missing. Fixed, behind everything, dimmed by a veil.
 */
export function VortexBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Warm-dark void. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,oklch(0.2_0.04_78),oklch(0.12_0.02_60)_58%,oklch(0.08_0.01_50))]" />

      {/* Drifting bokeh — teal + green edges, gold glow (reuses aurora drift). */}
      <div
        className="aurora-blob aurora-blob-1 left-[8%] top-[18%] size-[42vmin]"
        style={{ backgroundColor: "oklch(0.6 0.13 195 / 0.45)" }}
      />
      <div
        className="aurora-blob aurora-blob-2 right-[6%] top-[24%] size-[38vmin]"
        style={{ backgroundColor: "oklch(0.62 0.16 145 / 0.4)" }}
      />
      <div
        className="aurora-blob aurora-blob-3 bottom-[8%] left-[38%] size-[46vmin]"
        style={{ backgroundColor: "oklch(0.72 0.16 78 / 0.4)" }}
      />

      {/* CSS mandala fallback: light spokes + three rune rings + pulsing core.
          Covered by the artwork layer below when public/vortex.png exists. */}
      <div className="absolute left-1/2 top-1/2 size-[min(96vmin,820px)] -translate-x-1/2 -translate-y-1/2">
        <div className="vortex-rays absolute inset-0" />
        <div className="vortex-ring vortex-ring-3 absolute inset-0" />
        <div className="vortex-ring vortex-ring-2 absolute inset-0" />
        <div className="vortex-ring vortex-ring-1 absolute inset-0" />
        <div className="vortex-core absolute inset-[30%]" />
      </div>

      {/* Actual vortex artwork: oversized so rotation never reveals corners. */}
      <div className="absolute left-1/2 top-1/2 h-[170vmax] w-[170vmax] -translate-x-1/2 -translate-y-1/2">
        <div className="vortex-spin-layer absolute inset-0">
          <div className="vortex-img absolute inset-0" />
        </div>
      </div>

      {/* Readability veil — content sits on top of this. Kept light enough to
          let the gold read through, dark enough to keep text legible. */}
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-background/55" />
    </div>
  );
}

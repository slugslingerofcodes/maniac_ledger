/**
 * Ambient app backdrop: a golden "temporal rune vortex" — a pulsing core
 * ringed by concentric, counter-rotating rune bands and radiating light
 * spokes, over a warm-dark void with drifting teal/gold bokeh. Pure CSS
 * (conic gradients + radial masks + the aurora keyframes); no image assets.
 * Decorative only: fixed, behind everything, dimmed by a readability veil.
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

      {/* The mandala: light spokes + three rune rings + a pulsing core. */}
      <div className="absolute left-1/2 top-1/2 size-[min(96vmin,820px)] -translate-x-1/2 -translate-y-1/2">
        <div className="vortex-rays absolute inset-0" />
        <div className="vortex-ring vortex-ring-3 absolute inset-0" />
        <div className="vortex-ring vortex-ring-2 absolute inset-0" />
        <div className="vortex-ring vortex-ring-1 absolute inset-0" />
        <div className="vortex-core absolute inset-[30%]" />
      </div>

      {/* Readability veil — content sits on top of this. Kept light enough to
          let the gold read through, dark enough to keep text legible. */}
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-background/55" />
    </div>
  );
}

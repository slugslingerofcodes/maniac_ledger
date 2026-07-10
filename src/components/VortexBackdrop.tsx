/**
 * Ambient app backdrop: the vortex artwork (public/vortex.png) filling the
 * viewport with a slow Ken Burns drift, with the animated CSS "temporal rune
 * vortex" (rotating rune rings + light spokes + pulsing core) layered on top in
 * `screen` blend — so its golden light *adds* onto the photo and spins
 * independently, giving the still image live rotational motion. The teal/gold
 * bokeh + the same CSS vortex behind the image also serve as a graceful
 * fallback if the file is missing. Fixed, behind everything, dimmed by a veil.
 */
export function VortexBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Warm-dark void (fallback base). */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,oklch(0.2_0.04_78),oklch(0.12_0.02_60)_58%,oklch(0.08_0.01_50))]" />

      {/* Drifting bokeh — shows through if the artwork is missing. */}
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

      {/* Vortex artwork, filling the viewport with a slow Ken Burns drift. */}
      <div className="vortex-img absolute inset-0" />

      {/* Animated CSS vortex overlaid in `screen` blend: its rune rings, light
          spokes and pulsing core add glowing gold over the photo and rotate on
          their own, so the composite has layered, living motion. */}
      <div className="absolute inset-0 [mix-blend-mode:screen]">
        <div className="absolute left-1/2 top-1/2 size-[min(96vmin,820px)] -translate-x-1/2 -translate-y-1/2">
          <div className="vortex-rays absolute inset-0" />
          <div className="vortex-ring vortex-ring-3 absolute inset-0" />
          <div className="vortex-ring vortex-ring-2 absolute inset-0" />
          <div className="vortex-ring vortex-ring-1 absolute inset-0" />
          <div className="vortex-core absolute inset-[34%]" />
        </div>
      </div>

      {/* Readability veil — content sits on top of this. Kept light enough to
          let the artwork read through, dark enough to keep text legible. */}
      <div className="absolute inset-0 bg-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/45" />
    </div>
  );
}

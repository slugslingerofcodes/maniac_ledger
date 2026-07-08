/**
 * Ambient app backdrop: an original, abstract homage to Raphael — TenSura's
 * calm, analytical "Great Sage" — imagined as a breathing slime-blue core
 * inside slowly tumbling golden analysis rings, adrift in a night-blue void.
 * Pure CSS 3D (keyframes live in globals.css); no artwork assets, no deps.
 * Decorative only: fixed, behind everything, dimmed by a readability veil.
 */

// Deterministic mote layout (no Math.random — keeps SSR/CSR markup identical).
const MOTES = [
  { left: "18%", top: "30%", size: 5, delay: "0s", duration: "11s" },
  { left: "74%", top: "22%", size: 4, delay: "1.8s", duration: "13s" },
  { left: "62%", top: "70%", size: 6, delay: "3.2s", duration: "10s" },
  { left: "30%", top: "64%", size: 4, delay: "5s", duration: "14s" },
  { left: "84%", top: "52%", size: 5, delay: "6.4s", duration: "12s" },
  { left: "10%", top: "48%", size: 3, delay: "7.6s", duration: "15s" },
  { left: "48%", top: "14%", size: 3, delay: "9s", duration: "12s" },
] as const;

export function RaphaelBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Night-blue void. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,oklch(0.24_0.05_262),oklch(0.15_0.02_270)_62%,oklch(0.11_0.01_270))]" />

      {/* The entity: core + three counter-tumbling rings + drifting motes. */}
      <div className="sage-scene absolute left-1/2 top-[42%] size-[min(72vmin,580px)] -translate-x-1/2 -translate-y-1/2">
        <div className="sage-core absolute inset-[18%]" />
        <div className="sage-ring sage-ring-1 absolute inset-[6%]" />
        <div className="sage-ring sage-ring-2 absolute -inset-[4%]" />
        <div className="sage-ring sage-ring-3 absolute -inset-[14%]" />
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="sage-mote absolute rounded-full"
            style={{
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              animationDelay: m.delay,
              animationDuration: m.duration,
            }}
          />
        ))}
      </div>

      {/* Readability veil — content sits on top of this. */}
      <div className="absolute inset-0 bg-background/60" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
    </div>
  );
}

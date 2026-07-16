/**
 * Small radial score gauge: a ring filled proportionally to score/max with the
 * value centered. Pure SVG (fixed 32×32 viewBox scaled via `size`), so it
 * server-renders anywhere.
 */

const STROKE = 3;
const R = (32 - STROKE) / 2;
const C = 2 * Math.PI * R;

export function ScoreRing({
  score,
  max = 10,
  size = 32,
  color = "var(--primary)",
  className,
}: {
  score: number;
  max?: number;
  size?: number;
  /** Ring color; defaults to the accent. */
  color?: string;
  className?: string;
}) {
  const frac = Math.max(0, Math.min(1, score / max));
  const label = Number.isInteger(score) ? String(score) : score.toFixed(1);
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Score ${label} of ${max}`}
    >
      <circle
        cx="16"
        cy="16"
        r={R}
        fill="none"
        stroke="oklch(1 0 0 / 14%)"
        strokeWidth={STROKE}
      />
      {/* Dash offset (not a dash pattern) so the arc can sweep in via the
          ring-sweep keyframe — from the full circumference to this target.
          Pure CSS: still server-renderable, skipped under reduced motion. */}
      <circle
        cx="16"
        cy="16"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={(1 - frac) * C}
        transform="rotate(-90 16 16)"
        className="ring-sweep"
      />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
        fontSize="11"
        fontWeight="600"
      >
        {label}
      </text>
    </svg>
  );
}

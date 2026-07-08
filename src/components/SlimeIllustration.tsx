/**
 * Original SVG mascot for empty states: a generic sleepy gel blob having a
 * nap (drawn from scratch — no franchise artwork). Colors are hardcoded
 * OKLCH blues to match the app's dark theme.
 */
export function SlimeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="slime-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.85 0.08 225)" />
          <stop offset="1" stopColor="oklch(0.62 0.14 250)" />
        </linearGradient>
      </defs>
      {/* puddle shadow */}
      <ellipse cx="100" cy="120" rx="56" ry="9" fill="oklch(0.3 0.04 260 / 50%)" />
      {/* body — droopy blob */}
      <path
        d="M100 26 C 78 44 48 66 48 92 c0 22 24 30 52 30 s52 -8 52 -30 C 152 66 122 44 100 26 Z"
        fill="url(#slime-body)"
        opacity="0.9"
      />
      {/* glossy highlight */}
      <ellipse
        cx="82"
        cy="62"
        rx="10"
        ry="16"
        fill="oklch(0.97 0.02 220 / 55%)"
        transform="rotate(-20 82 62)"
      />
      {/* sleepy eyes */}
      <path
        d="M78 92 q7 7 14 0"
        stroke="oklch(0.25 0.05 265)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M108 92 q7 7 14 0"
        stroke="oklch(0.25 0.05 265)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* tiny mouth */}
      <path
        d="M97 104 q3 3 6 0"
        stroke="oklch(0.25 0.05 265)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* zzz */}
      <g fill="oklch(0.85 0.09 235)" fontWeight="700">
        <text x="144" y="48" fontSize="18">
          z
        </text>
        <text x="157" y="33" fontSize="14">
          z
        </text>
        <text x="168" y="21" fontSize="11">
          z
        </text>
      </g>
    </svg>
  );
}

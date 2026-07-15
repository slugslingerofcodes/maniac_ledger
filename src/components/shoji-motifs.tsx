import type { ReactNode } from "react";

/**
 * Sumi-e style artwork painted across the shōji doors — the way a real fusuma
 * carries one picture split over its panels.
 *
 * Each motif is drawn once in a 1600×900 viewBox spanning the FULL doorway; the
 * left panel renders its left half and the right panel its right half, so the
 * scene joins at the seam when the doors meet and tears apart as they open.
 * Compositions are deliberately weighted so each half reads on its own too
 * (the samurai face off across the seam; the dragon's head and tail land on
 * opposite panels).
 */
export const SHOJI_MOTIFS = [
  "waves",
  "dragon",
  "samurai",
  "crane",
  "fuji",
  "bamboo",
] as const;

export type ShojiMotif = (typeof SHOJI_MOTIFS)[number];

/**
 * The painting a given route's doors carry. Deterministic on purpose: picking
 * at random would make render impure (and disagree with itself under StrictMode
 * /hydration), and it guarantees the close and the open show the *same* scene
 * rather than swapping mid-transition. The upshot is that each corner of the
 * app keeps its own door art.
 */
export function motifForPath(path: string): ShojiMotif {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
  }
  return SHOJI_MOTIFS[hash % SHOJI_MOTIFS.length]!;
}

/** Which half of the doorway a motif is being painted onto. */
type MotifProps = { side: "left" | "right" };

/** Sumi ink, matching the door's kumiko lattice. */
const INK = "oklch(0.32 0.03 60)";
/** Faded wash for background elements. */
const WASH = "oklch(0.45 0.04 60 / 0.35)";
/** Weathered vermilion, for suns and seals. */
const VERMILION = "oklch(0.52 0.17 32 / 0.75)";

/**
 * Seigaiha — overlapping wave crests, the classic blue-wave pattern.
 *
 * Drawn as a tiled <pattern> rather than looping out the arcs: the naive
 * version emitted ~1,200 <path> nodes, and these doors mount and unmount on
 * every single navigation, so that cost lands right in the middle of the
 * transition. One tile of 8 arcs covers the doorway just as well.
 */
function Waves({ side }: MotifProps) {
  // Both panels render this same component, so the pattern id must differ or
  // the two <svg>s would collide on one DOM id.
  const patternId = `shoji-seigaiha-${side}`;
  const arc = (cx: number, cy: number, r: number) => (
    <path
      key={`${cx}-${cy}-${r}`}
      d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
      fill="none"
      stroke={INK}
      strokeOpacity={0.5}
      strokeWidth={3}
    />
  );
  return (
    <>
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width="100"
          height="62"
          patternUnits="userSpaceOnUse"
        >
          {[46, 34, 22, 10].map((r) => arc(0, 62, r))}
          {[46, 34, 22, 10].map((r) => arc(100, 62, r))}
          {[46, 34, 22, 10].map((r) => arc(50, 31, r))}
        </pattern>
      </defs>
      <rect
        x="0"
        y="0"
        width="1600"
        height="900"
        fill={`url(#${patternId})`}
      />
    </>
  );
}

/** A coiling dragon — head on the left panel, tail whipping onto the right. */
function Dragon() {
  return (
    <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
      {/* Serpentine body: one long S through the doorway. */}
      <path
        d="M 250 470 C 380 300, 560 300, 660 430 C 760 560, 900 600, 1030 500 C 1140 415, 1240 420, 1330 500"
        strokeWidth={54}
        strokeOpacity={0.32}
      />
      <path
        d="M 250 470 C 380 300, 560 300, 660 430 C 760 560, 900 600, 1030 500 C 1140 415, 1240 420, 1330 500"
        strokeWidth={26}
        strokeOpacity={0.75}
      />
      {/* Spine ridges */}
      {[
        [430, 336],
        [545, 340],
        [660, 430],
        [790, 545],
        [925, 570],
        [1055, 487],
        [1180, 424],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x} ${y! - 34} l 18 26 l -34 6 z`}
          fill={INK}
          fillOpacity={0.6}
          stroke="none"
        />
      ))}
      {/* Head */}
      <g strokeWidth={12} strokeOpacity={0.85}>
        <path
          d="M 250 470 c -46 -30 -84 -22 -112 6 c -26 26 -20 66 14 84 c 40 22 92 6 108 -34"
          fill={INK}
          fillOpacity={0.25}
        />
        {/* Horns */}
        <path d="M 196 432 c -18 -44 -46 -66 -84 -72" />
        <path d="M 232 442 c -6 -46 -26 -74 -58 -92" />
        {/* Whiskers */}
        <path d="M 140 566 c -44 30 -86 30 -124 4" strokeOpacity={0.6} />
        <path d="M 168 574 c -30 48 -70 70 -116 70" strokeOpacity={0.6} />
        {/* Eye */}
        <circle cx={176} cy={498} r={9} fill={INK} stroke="none" />
      </g>
      {/* Claws */}
      <g strokeWidth={10} strokeOpacity={0.7}>
        <path d="M 640 486 l -34 60 m 34 -60 l 4 68 m -4 -68 l 40 62" />
        <path d="M 1010 556 l -30 62 m 30 -62 l 6 70 m -6 -70 l 38 60" />
      </g>
      {/* Tail flick */}
      <path
        d="M 1330 500 c 60 54 118 60 176 22"
        strokeWidth={16}
        strokeOpacity={0.6}
      />
      {/* Clouds it rides through */}
      <g stroke={WASH} strokeWidth={8}>
        <path d="M 980 210 c 60 -46 150 -40 190 14 c 60 -20 118 12 124 66" />
        <path d="M 300 720 c 70 -44 156 -34 198 22" />
      </g>
    </g>
  );
}

/** One duellist. Drawn facing right; `flip` mirrors him across the doorway. */
function SamuraiFighter({ flip }: { flip: boolean }) {
  return (
    <g
      transform={flip ? "translate(1600,0) scale(-1,1)" : undefined}
      fill={INK}
      fillOpacity={0.82}
    >
      {/* Blade, angled toward the seam */}
      <g stroke={INK} strokeOpacity={0.85} strokeLinecap="round" fill="none">
        <path d="M 470 300 C 560 340, 640 390, 700 452" strokeWidth={9} />
        <path d="M 452 292 l 30 -16" strokeWidth={13} />
      </g>
      {/* Head + kabuto */}
      <circle cx={352} cy={286} r={30} />
      <path d="M 316 268 c 18 -40 72 -40 88 -2 c -30 -12 -60 -12 -88 2 z" />
      {/* Torso, hakama flare */}
      <path d="M 352 320 c 40 0 62 34 66 72 l 10 96 l -46 12 l -12 -70 l -22 74 l -50 -8 l 8 -110 c 4 -40 26 -66 46 -66 z" />
      {/* Legs, braced stance */}
      <path d="M 320 502 l -46 122 l 34 12 l 56 -108 z" />
      <path d="M 382 500 l 54 118 l -32 16 l -62 -104 z" />
      {/* Arms to the hilt */}
      <path
        d="M 388 356 c 34 -6 62 -18 82 -50"
        stroke={INK}
        strokeOpacity={0.8}
        strokeWidth={18}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Two samurai squaring off across the seam — the doorway is the duel. */
function Samurai() {
  return (
    <g>
      {/* Rising sun behind the clash */}
      <circle cx={800} cy={330} r={190} fill={VERMILION} opacity={0.3} />
      {/* Ground wash */}
      <path
        d="M 0 660 C 420 618, 1180 618, 1600 660 L 1600 900 L 0 900 z"
        fill={WASH}
      />
      <SamuraiFighter flip={false} />
      <SamuraiFighter flip />
      {/* Sparks where the blades meet, dead on the seam */}
      <g stroke={INK} strokeWidth={6} strokeOpacity={0.7} strokeLinecap="round">
        <path d="M 800 452 l -44 -30 M 800 452 l 44 -30 M 800 452 l 0 -52 M 800 452 l -30 36 M 800 452 l 30 36" />
      </g>
    </g>
  );
}

/** A single crane mid-beat, placed and scaled by the motif. */
function CraneBird({
  x,
  y,
  s,
  o,
}: {
  x: number;
  y: number;
  s: number;
  o: number;
}) {
  return (
    <g
      transform={`translate(${x},${y}) scale(${s})`}
      fill="none"
      stroke={INK}
      strokeOpacity={o}
      strokeLinecap="round"
    >
      {/* Body */}
      <path d="M -60 0 c 30 -26 90 -26 120 0 c -30 22 -90 22 -120 0 z" fill={INK} fillOpacity={o * 0.5} strokeWidth={5} />
      {/* Wings, mid-beat */}
      <path d="M 10 -6 c -20 -60 -70 -96 -140 -104 c 44 44 66 82 74 110" strokeWidth={6} />
      <path d="M 10 6 c -18 56 -62 92 -128 102 c 42 -42 62 -78 70 -104" strokeWidth={6} />
      {/* Neck + head */}
      <path d="M 58 -4 c 40 -14 68 -34 92 -66" strokeWidth={6} />
      <path d="M 150 -70 l 34 -10" strokeWidth={5} />
      {/* Trailing legs */}
      <path d="M -56 6 c -40 16 -70 22 -104 20" strokeWidth={4} strokeOpacity={o * 0.8} />
    </g>
  );
}

/** Cranes in flight over a wash — tsuru, the classic fusuma bird. */
function Crane() {
  return (
    <g>
      <circle cx={1240} cy={250} r={150} fill={VERMILION} opacity={0.22} />
      <CraneBird x={520} y={330} s={1.15} o={0.8} />
      <CraneBird x={1010} y={520} s={0.85} o={0.6} />
      <CraneBird x={1330} y={690} s={0.6} o={0.42} />
      <g stroke={WASH} strokeWidth={7} fill="none">
        <path d="M 120 760 c 90 -40 210 -34 280 18" />
        <path d="M 900 812 c 120 -46 260 -34 360 22" />
      </g>
    </g>
  );
}

/** Fuji under a red sun, with wave crests at its foot. */
function Fuji() {
  return (
    <g>
      <circle cx={1180} cy={250} r={130} fill={VERMILION} opacity={0.5} />
      {/* Far ridge */}
      <path
        d="M 0 700 L 340 520 L 620 700 z"
        fill={INK}
        fillOpacity={0.18}
      />
      {/* The mountain */}
      <path
        d="M 380 720 L 800 300 L 1220 720 z"
        fill={INK}
        fillOpacity={0.45}
      />
      {/* Snow cap */}
      <path
        d="M 800 300 L 906 406 c -30 16 -50 -14 -74 6 c -22 18 -40 -8 -62 4 c -20 10 -34 -10 -52 -2 z"
        fill="oklch(0.95 0.02 85)"
        fillOpacity={0.75}
      />
      {/* Ground + wave crests */}
      <path
        d="M 0 720 L 1600 720 L 1600 900 L 0 900 z"
        fill={INK}
        fillOpacity={0.12}
      />
      <g fill="none" stroke={INK} strokeOpacity={0.4} strokeWidth={5}>
        <path d="M 60 790 c 60 -34 130 -34 190 0 c 60 34 130 34 190 0" />
        <path d="M 620 830 c 60 -34 130 -34 190 0 c 60 34 130 34 190 0" />
        <path d="M 1130 786 c 60 -34 130 -34 190 0 c 60 34 130 34 190 0" />
      </g>
    </g>
  );
}

/** One bamboo stalk with its nodes and leaves. */
function BambooStalk({ x, w, o }: { x: number; w: number; o: number }) {
  return (
    <g stroke={INK} strokeOpacity={o} fill="none">
      <path d={`M ${x} -20 L ${x} 920`} strokeWidth={w} />
      {[90, 250, 410, 570, 730, 880].map((y) => (
        <path key={y} d={`M ${x - w / 2 - 4} ${y} L ${x + w / 2 + 4} ${y}`} strokeWidth={w * 0.42} />
      ))}
      {/* Leaves */}
      <path d={`M ${x} 250 c 60 -40 110 -44 160 -18`} strokeWidth={w * 0.3} strokeOpacity={o * 0.8} />
      <path d={`M ${x} 570 c -60 -40 -110 -44 -160 -18`} strokeWidth={w * 0.3} strokeOpacity={o * 0.8} />
    </g>
  );
}

/** Bamboo grove — take, the quietest of the set. */
function Bamboo() {
  return (
    <g>
      <BambooStalk x={210} w={34} o={0.65} />
      <BambooStalk x={430} w={22} o={0.42} />
      <BambooStalk x={760} w={40} o={0.72} />
      <BambooStalk x={1080} w={24} o={0.45} />
      <BambooStalk x={1360} w={32} o={0.6} />
      <g stroke={WASH} strokeWidth={6} fill="none">
        <path d="M 560 700 c 80 -30 150 -24 200 20" />
        <path d="M 1150 300 c 70 -34 140 -26 190 22" />
      </g>
    </g>
  );
}

const ART: Record<ShojiMotif, (props: MotifProps) => ReactNode> = {
  waves: Waves,
  dragon: Dragon,
  samurai: Samurai,
  crane: Crane,
  fuji: Fuji,
  bamboo: Bamboo,
};

/**
 * The half of `motif` belonging to `side`. The svg is drawn at twice the panel
 * width and shifted, so the two panels together show one continuous painting.
 */
export function ShojiArt({
  motif,
  side,
}: {
  motif: ShojiMotif;
  side: "left" | "right";
}) {
  const Art = ART[motif];
  return (
    <svg
      aria-hidden
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-y-0 h-full"
      style={{ width: "200%", left: side === "left" ? 0 : "-100%" }}
    >
      <Art side={side} />
    </svg>
  );
}

"use client";

import { motion } from "framer-motion";

import { DOOR_MS, WORLD_OPEN_MS } from "@/components/doors/timing";
import { ShojiArt, type ShojiMotif } from "@/components/shoji-motifs";

/**
 * The two sliding shōji panels (and, for a poster world, the light spilling
 * out between them). The visual half of `ShojiDoors`, split out so that
 * framer-motion — the bulk of its weight — is fetched on idle instead of
 * riding in the root layout's first-load JS on every route, including the
 * auth pages that otherwise never touch it. `ShojiDoors` keeps the state
 * machine, the click capture and every timer; this only draws a phase.
 */
export function DoorPanels({
  shut,
  posterSrc,
  motif,
}: {
  /** Closing (true) or parting (false). */
  shut: boolean;
  posterSrc: string | null;
  motif: ShojiMotif;
}) {
  // The close always snaps to the click; only the poster reveal lingers.
  const transition = {
    duration: (shut || !posterSrc ? DOOR_MS : WORLD_OPEN_MS) / 1000,
    ease: "easeInOut" as const,
  };

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] flex overflow-hidden"
    >
      <motion.div
        initial={{ x: shut ? "-101%" : "0%" }}
        animate={{ x: shut ? "0%" : "-101%" }}
        transition={transition}
        className="shoji-panel relative h-full w-1/2 overflow-hidden border-r-2 border-[oklch(0.32_0.03_60)]"
      >
        {posterSrc ? (
          <WorldArt src={posterSrc} side="left" />
        ) : (
          <ShojiArt motif={motif} side="left" />
        )}
      </motion.div>
      <motion.div
        initial={{ x: shut ? "101%" : "0%" }}
        animate={{ x: shut ? "0%" : "101%" }}
        transition={transition}
        className="shoji-panel relative h-full w-1/2 overflow-hidden border-l-2 border-[oklch(0.32_0.03_60)]"
      >
        {posterSrc ? (
          <WorldArt src={posterSrc} side="right" />
        ) : (
          <ShojiArt motif={motif} side="right" />
        )}
      </motion.div>
      {/* Light spills out of the parting doors of a poster world. */}
      {posterSrc && !shut ? (
        <motion.div
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: WORLD_OPEN_MS / 1000, ease: "easeOut" }}
          className="absolute inset-y-0 left-1/2 w-48 -translate-x-1/2"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 50%, rgb(255 255 255 / 0.55), transparent 70%)",
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The clicked poster painted across the full doorway: each panel is half the
 * viewport, so an inner layer twice the panel's width carries the whole image
 * and the two halves join at the seam — the same trick the sumi-e motifs use.
 * A faint kumiko lattice and edge vignette keep it reading as a shōji door
 * rather than a bare image.
 */
function WorldArt({ src, side }: { src: string; side: "left" | "right" }) {
  return (
    <div aria-hidden className="absolute inset-0">
      <div
        style={{ backgroundImage: `url(${src})` }}
        className={
          "absolute inset-y-0 w-[200%] bg-cover bg-center " +
          (side === "left" ? "left-0" : "right-0")
        }
      />
      <div className="shoji-lattice absolute inset-0 opacity-35" />
      <div
        className={
          "absolute inset-y-0 w-28 " +
          (side === "left"
            ? "left-0 bg-gradient-to-r from-black/45 to-transparent"
            : "right-0 bg-gradient-to-l from-black/45 to-transparent")
        }
      />
    </div>
  );
}

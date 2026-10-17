/**
 * Door timings, shared by the `ShojiDoors` controller (which runs the timers)
 * and the lazily-loaded `DoorPanels` (which animates to them). Their own
 * module so the controller can import them without statically pulling in the
 * panels — and framer-motion with them.
 */

/** One panel sweep. Kept short — this sits in front of every navigation. */
export const DOOR_MS = 280;
/** Poster doors part slower — the reveal of the world is the moment. */
export const WORLD_OPEN_MS = 480;
/** The WebGL shatter needs longer than a slide to land its acceleration. */
export const SHATTER_MS = 850;
/** If a push never commits (slow RSC, aborted nav), part the doors anyway. */
export const STUCK_MS = 6000;

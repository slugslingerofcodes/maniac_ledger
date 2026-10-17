/**
 * framer-motion's feature bundles, in a module of their own so that they are
 * only ever reached through a dynamic `import()` (see `lazy-motion.ts`) and
 * land in an async chunk instead of the first-load JS of every route.
 *
 * Don't import this statically — that would pull the bundles straight back
 * into whichever chunk imports it.
 */
export { domAnimation, domMax } from "framer-motion";

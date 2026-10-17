/**
 * Keyboard model for a browse row: one tab stop per row (roving tabindex), and
 * the arrow keys move focus between its items — the pattern TV-style browsers
 * use, and the one that keeps a page of eight rows from costing 150 Tab presses.
 *
 * Kept as a pure function so the index math is testable without a DOM.
 * Returns the index focus should move to, or `null` when the key isn't ours
 * (the caller then leaves the event alone, so Tab, Enter and page scrolling
 * with ↑/↓ behave normally).
 *
 * The ends clamp rather than wrap: wrapping from the last card to the first
 * jumps the scroll position across the whole row, which reads as a glitch.
 */
export function nextRowIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const from = Math.min(Math.max(current, 0), last);
  switch (key) {
    case "ArrowRight":
      return Math.min(from + 1, last);
    case "ArrowLeft":
      return Math.max(from - 1, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** Attribute on each row item, and on the element inside it that takes focus. */
export const ROW_ITEM_ATTR = "data-row-item";
export const ROW_FOCUS_ATTR = "data-row-focus";

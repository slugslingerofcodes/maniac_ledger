import type { Locator, Page } from "@playwright/test";

/*
 * Both probes run inside the page. Functions can't be passed into
 * `evaluate`, and rebuilding one from a string there would be an eval the
 * app's CSP forbids, so each callback carries its own copy of `describe`.
 */

export type HorizontalOverflow = {
  /** Width the page has to fit (the layout viewport, minus any scrollbar). */
  viewport: number;
  /** Width of the scrollable page. Anything past `viewport` scrolls sideways. */
  scrollWidth: number;
  /** Up to five elements poking past the right edge, as leads for a failure. */
  offenders: string[];
};

/**
 * How far the page scrolls sideways. A browse row's own horizontal track is
 * fine — it scrolls inside its box — so only *page* overflow counts, which is
 * exactly what `documentElement.scrollWidth` measures.
 *
 * The offender list skips elements inside anything that clips or scrolls on
 * the x axis (those can't widen the page) and fixed-position layers (drawers
 * parked off-screen don't either).
 */
export async function measureHorizontalOverflow(page: Page): Promise<HorizontalOverflow> {
  return page.evaluate(() => {
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
    };
    const root = document.documentElement;
    const viewport = root.clientWidth;
    const offenders: string[] = [];

    if (root.scrollWidth > viewport) {
      const contained = (el: Element) => {
        for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (style.position === "fixed") return true;
          if (p !== el && style.overflowX !== "visible") return true;
        }
        return false;
      };
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= viewport + 1 || contained(el)) continue;
        offenders.push(`${describe(el)} (right edge ${Math.round(r.right)}px)`);
        if (offenders.length === 5) break;
      }
    }
    return { viewport, scrollWidth: root.scrollWidth, offenders };
  });
}

/**
 * Probes points across the viewport and reports each one where the topmost
 * element is *not* inside `overlay` — i.e. where something else paints over a
 * layer that is supposed to cover the page.
 *
 * The probes sit where a stacking-context bug shows through: the top strip
 * (the sticky header), the middle, the lower half (the sections after the
 * detail hero) and the bottom strip (the mobile tab bar).
 */
export async function pointsPaintedOver(overlay: Locator): Promise<string[]> {
  return overlay.evaluate((el) => {
    const describe = (node: Element) => {
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
      return node.tagName.toLowerCase() + (node.id ? `#${node.id}` : "") + (cls ? `.${cls}` : "");
    };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const probes: Array<[string, number, number]> = [
      ["top", w / 2, 12],
      ["top-left", 12, 12],
      ["middle", w / 2, h / 2],
      ["lower half", w / 2, h * 0.75],
      ["left edge", 12, h / 2],
      ["bottom", w / 2, h - 12],
    ];
    const covered: string[] = [];
    for (const [name, x, y] of probes) {
      const top = document.elementFromPoint(x, y);
      if (top && !el.contains(top)) {
        covered.push(`${name} (${Math.round(x)},${Math.round(y)}) shows ${describe(top)}`);
      }
    }
    return covered;
  });
}

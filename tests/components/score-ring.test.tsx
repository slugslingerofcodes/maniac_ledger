// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScoreRing } from "@/components/ScoreRing";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * First rendering test in the suite — deliberately a pure-SVG component with
 * no data fetching, so it establishes the jsdom + testing-library pattern
 * without any mocking. The arc math is the part a typecheck can't see: a
 * wrong fraction renders a confident-looking but lying gauge.
 */

const CIRCUMFERENCE = 2 * Math.PI * ((32 - 3) / 2);

/** The progress arc is the circle carrying a dashoffset. */
function arcOf(container: HTMLElement): SVGCircleElement {
  const arc = container.querySelector("circle[stroke-dashoffset]");
  if (!arc) throw new Error("no progress arc rendered");
  return arc as SVGCircleElement;
}

describe("ScoreRing", () => {
  it("labels itself for screen readers", () => {
    render(<ScoreRing score={8} />);

    expect(screen.getByRole("img", { name: "Score 8 of 10" })).toBeDefined();
  });

  it("shows the score value", () => {
    render(<ScoreRing score={8} />);

    expect(screen.getByText("8")).toBeDefined();
  });

  it("keeps one decimal for fractional scores", () => {
    render(<ScoreRing score={9.28} />);

    expect(screen.getByText("9.3")).toBeDefined();
  });

  it("fills the arc proportionally to the score", () => {
    const { container } = render(<ScoreRing score={5} />);

    // Half score → half the circumference still offset (hidden).
    const offset = Number(arcOf(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(CIRCUMFERENCE / 2, 5);
  });

  it("renders a full ring at the maximum", () => {
    const { container } = render(<ScoreRing score={10} />);

    expect(Number(arcOf(container).getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
  });

  it("clamps an out-of-range score instead of overflowing the ring", () => {
    const { container } = render(<ScoreRing score={14} />);

    expect(Number(arcOf(container).getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
  });

  it("respects a custom maximum", () => {
    const { container } = render(<ScoreRing score={1} max={5} />);

    const offset = Number(arcOf(container).getAttribute("stroke-dashoffset"));
    expect(offset).toBeCloseTo(CIRCUMFERENCE * 0.8, 5);
  });
});

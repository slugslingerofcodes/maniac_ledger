"use client";

import { Fragment } from "react";

import { cn } from "@/lib/utils";

/**
 * Numbered pager: first/last always visible, a ±2 window around the current
 * page, ellipses for the gaps. Windowed so a 200-page result set stays tidy.
 * Shared by /search, /movies, and /seasons.
 */
export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
}) {
  if (totalPages <= 1) return null;

  const nums = new Set<number>([1, totalPages]);
  for (let n = page - 2; n <= page + 2; n++) {
    if (n >= 1 && n <= totalPages) nums.add(n);
  }
  const list = [...nums].sort((a, b) => a - b);

  const navBtn =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav
      aria-label="Result pages"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className={cn(navBtn, "bg-muted text-muted-foreground hover:text-foreground")}
      >
        ‹ Prev
      </button>
      {list.map((n, i) => (
        <Fragment key={n}>
          {i > 0 && n - list[i - 1]! > 1 ? (
            <span aria-hidden className="px-1 text-muted-foreground">
              …
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onPage(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              navBtn,
              "tabular-nums",
              n === page
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {n}
          </button>
        </Fragment>
      ))}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className={cn(navBtn, "bg-muted text-muted-foreground hover:text-foreground")}
      >
        Next ›
      </button>
    </nav>
  );
}

"use client";

import { useState } from "react";
import { DownloadIcon, Share2Icon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Anime Wrapped — a per-year shareable recap card. The card itself is rendered
 * server-side as an image by /api/wrapped-image (next/og), so the preview, the
 * download, and the share sheet all use the exact same artwork.
 */
export function WrappedCard({ years }: { years: number[] }) {
  const [year, setYear] = useState<number>(years[0]!);
  const [loaded, setLoaded] = useState(false);
  const src = `/api/wrapped-image?year=${year}`;

  async function share() {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], `anime-wrapped-${year}.png`, {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `My ${year} Anime Wrapped`,
        });
        return;
      }
    } catch {
      /* fall through to download */
    }
    // No Web Share support — trigger a download instead.
    const a = document.createElement("a");
    a.href = src;
    a.download = `anime-wrapped-${year}.png`;
    a.click();
  }

  return (
    <Card className="mt-6 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Anime Wrapped</h2>
            <p className="text-xs text-muted-foreground">
              Your year in anime, as a shareable card.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {years.slice(0, 5).map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setYear(y);
                  setLoaded(false);
                }}
                aria-pressed={y === year}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium tabular-nums transition",
                  y === year
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl ring-1 ring-border">
            {/* Plain <img>: the source is a dynamic same-origin PNG endpoint. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={src}
              src={src}
              alt={`Anime Wrapped ${year}`}
              className={cn(
                "aspect-square w-full object-cover transition-opacity",
                loaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={() => setLoaded(true)}
            />
            {!loaded ? (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={share}>
              <Share2Icon className="mr-1.5 size-3.5" /> Share
            </Button>
            <a
              href={src}
              download={`anime-wrapped-${year}.png`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <DownloadIcon className="mr-1.5 size-3.5" /> Download
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

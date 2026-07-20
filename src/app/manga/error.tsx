"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Manga-side counterpart of the (app) boundary — keeps MangaNav alive. */
export default function MangaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page hit an unexpected error. It&apos;s usually temporary — try
        again, or head back to your manga library.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">
          Error reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/manga"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to manga
        </Link>
      </div>
    </div>
  );
}

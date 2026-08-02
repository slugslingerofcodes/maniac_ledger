"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { addToLibraryByMalId } from "@/app/actions/library";
import { LIBRARY_QUERY_KEY } from "@/app/(app)/library/library-grid-client";
import { dismissRecommendation } from "@/app/actions/recommendations";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";

export type RecItem = {
  malId: number | null;
  title: string;
  posterUrl: string | null;
  score: number | null;
  reason: string;
};

export function RecommendationCard({
  item,
  onDismiss,
  onRestore,
}: {
  item: RecItem;
  onDismiss: (malId: number) => void;
  /** Puts the card back when an optimistic dismiss turns out to have failed. */
  onRestore?: (item: RecItem) => void;
}) {
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const canAct = item.malId != null;

  // Both actions flip the UI first and undo it on failure: an add is a single
  // upsert and a dismiss is a single update, so the success rate is high enough
  // that waiting on the round trip costs far more than the rare rollback.
  function add() {
    if (item.malId == null) return;
    const malId = item.malId;
    setAdded(true);
    startTransition(async () => {
      const res = await addToLibraryByMalId(malId);
      if (!res.ok) {
        setAdded(false);
        toast.error(res.error);
        return;
      }
      // Refetch the library grid so the added title appears immediately.
      queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
      track("recommendation_clicked", { malId, title: item.title });
      track("anime_added", { malId, title: item.title, source: "recommendation" });
      toast.success(
        res.alreadyAdded ? "Already in your library." : "Added to library.",
      );
    });
  }

  function dismiss() {
    if (item.malId == null) return;
    const malId = item.malId;
    // Remove it now — the parent's framer-motion exit plays immediately, and a
    // failed dismiss puts it back via the parent's restore path.
    onDismiss(malId);
    startTransition(async () => {
      const res = await dismissRecommendation(malId);
      if (!res.ok) {
        onRestore?.(item);
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="w-48 gap-0 overflow-hidden py-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="192px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}

        <Tooltip label="Not interested">
          <button
            type="button"
            onClick={dismiss}
            disabled={pending || !canAct}
            aria-label={`Dismiss ${item.title}`}
            className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-50"
          >
            <XIcon className="size-3.5" />
          </button>
        </Tooltip>

        {item.score != null ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-amber-300 backdrop-blur">
            ★ {item.score.toFixed(2)}
          </span>
        ) : null}
      </div>

      <CardContent className="flex flex-col gap-2 p-3">
        <h3
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={item.title}
        >
          {item.title}
        </h3>

        <div className="mt-1 flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={pending || added || !canAct}
          >
            {added ? "Added ✓" : "+ Add to library"}
          </Button>

          <Dialog>
            <DialogTrigger
              render={<Button variant="outline" size="sm" />}
              disabled={!item.reason}
            >
              Why this?
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{item.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Why this anime was recommended
                </DialogDescription>
              </DialogHeader>
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {item.reason}
              </p>
              <p className="text-xs text-muted-foreground">
                Suggested by AI from anime you&apos;ve rated highly.
              </p>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

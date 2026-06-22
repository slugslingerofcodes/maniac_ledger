"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { toggleNotify } from "@/app/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type UpcomingItem = {
  malId: number;
  title: string;
  posterUrl: string | null;
  broadcastDay: string | null;
  studio: string | null;
  scheduledDate: string | null;
};

export function UpcomingCard({
  item,
  initialNotifying,
}: {
  item: UpcomingItem;
  initialNotifying: boolean;
}) {
  const [notifying, setNotifying] = useState(initialNotifying);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    const prev = notifying;
    setNotifying(!prev); // optimistic flip

    startTransition(async () => {
      const res = await toggleNotify({
        malId: item.malId,
        animeTitle: item.title,
        posterUrl: item.posterUrl,
        scheduledDate: item.scheduledDate,
      });
      if (!res.ok) {
        setNotifying(prev);
        toast.error(res.error);
      } else {
        setNotifying(res.notifying);
        toast.success(
          res.notifying
            ? "We'll remind you when it airs."
            : "Reminder removed.",
        );
      }
    });
  }

  return (
    <Card className="group gap-0 overflow-hidden py-0">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {item.broadcastDay ? (
          <Badge className="absolute left-2 top-2 border-transparent bg-black/70 text-white backdrop-blur">
            {item.broadcastDay}
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-col gap-2 p-3">
        <h3
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={item.title}
        >
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {item.studio ?? "Studio TBA"}
        </p>

        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-pressed={notifying}
          className={cn(
            "mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
            notifying
              ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          {notifying ? "🔔 Notifying — tap to cancel" : "🔔 Notify me when it airs"}
        </button>
      </CardContent>
    </Card>
  );
}

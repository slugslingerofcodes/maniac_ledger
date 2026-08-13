"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BellOff, CalendarClock, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { dismissReminder, type ReminderItem } from "@/app/actions/notifications";
import { markRemindersSeen } from "@/components/NotificationBell";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { buttonVariants } from "@/components/ui/button";
import { posterUrl } from "@/lib/poster";
import { cn } from "@/lib/utils";

const DATE_FMT = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  // Parse as UTC midnight so a YYYY-MM-DD never shifts a day in a negative
  // timezone offset.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return DATE_FMT.format(d);
}

export function NotificationsClient({ initial }: { initial: ReminderItem[] }) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();

  // Opening the inbox is what "reading" means here — clear the bell.
  useEffect(() => {
    markRemindersSeen();
  }, []);

  function dismiss(item: ReminderItem) {
    const previous = items;
    setItems((list) => list.filter((i) => i.id !== item.id));
    startTransition(async () => {
      const res = await dismissReminder(item.id);
      if (!res.ok) {
        setItems(previous);
        toast.error(res.error);
      }
    });
  }

  if (items.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-transparent">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <CalendarClock className="size-10 text-muted-foreground" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">
            No reminders yet. Tap the bell on anything in{" "}
            <span className="font-medium text-foreground">Upcoming</span> and
            we&apos;ll tell you the day it airs.
          </p>
          <Link href="/upcoming" className={cn(buttonVariants())}>
            Browse upcoming
          </Link>
        </CardContent>
      </Card>
    );
  }

  const due = items.filter((i) => i.due);
  const waiting = items.filter((i) => !i.due);

  return (
    <div className="flex flex-col gap-8">
      {due.length > 0 ? (
        <Section
          title="Ready to watch"
          hint="These have aired."
          items={due}
          onDismiss={dismiss}
          highlight
        />
      ) : null}
      {waiting.length > 0 ? (
        <Section
          title="Waiting"
          hint="We'll let you know."
          items={waiting}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  onDismiss,
  highlight = false,
}: {
  title: string;
  hint: string;
  items: ReminderItem[];
  onDismiss: (item: ReminderItem) => void;
  highlight?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-xl bg-card p-3 ring-1 transition",
              highlight ? "ring-primary/40" : "ring-foreground/10",
            )}
          >
            <Link
              href={`/anime/mal/${item.malId}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-muted">
                {item.posterUrl ? (
                  <Image
                    src={posterUrl(item.posterUrl, "card")!}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm font-medium">
                  {item.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {highlight ? (
                    <Sparkles className="size-3 text-primary" aria-hidden />
                  ) : (
                    <CalendarClock className="size-3" aria-hidden />
                  )}
                  {formatDate(item.scheduledDate)}
                </span>
              </span>
            </Link>
            <Tooltip label="Remove reminder">
              <button
                type="button"
                onClick={() => onDismiss(item)}
                aria-label={`Remove the reminder for ${item.title}`}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <BellOff className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}

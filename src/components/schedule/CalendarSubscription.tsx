"use client";

import { useId, useRef, useState } from "react";
import { CalendarSync, Copy, RefreshCw, Rss, Unlink } from "lucide-react";
import { toast } from "sonner";

import { revokeCalendarFeed, rotateCalendarFeed } from "@/app/actions/calendar-feed";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

const UNREACHABLE = "Couldn't reach the server. Try again.";

/**
 * The live counterpart to "Add to calendar": a private URL a calendar app
 * subscribes to and refreshes on its own (`/api/calendar/feed/<token>.ics`).
 *
 * Only a hash of the token is stored, so the full link exists in exactly one
 * place after it's minted — this component's state. After a reload the page
 * knows a link is *on* but can't show it again; making a new one is the way to
 * copy it, which is why replacing and turning off both ask first: either one
 * silently stops every calendar that uses the current link.
 */
export function CalendarSubscription({
  active: initiallyActive,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const online = useOnlineStatus();
  const [active, setActive] = useState(initiallyActive);
  const [url, setUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"rotate" | "revoke" | null>(null);
  const [pending, setPending] = useState(false);
  // State re-renders too late to stop a fast double click; the ref doesn't.
  const inFlight = useRef(false);
  const helperId = useId();
  const inputId = useId();

  async function guarded(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await work();
    } catch {
      toast.error(UNREACHABLE);
    } finally {
      inFlight.current = false;
      setPending(false);
      setConfirming(null);
    }
  }

  const rotate = () =>
    guarded(async () => {
      const replacing = active;
      const result = await rotateCalendarFeed();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl(new URL(result.path, window.location.origin).toString());
      setActive(true);
      toast.success(
        replacing
          ? "New link ready. The old one no longer works."
          : "Calendar link ready — add it to your calendar app.",
      );
    });

  const revoke = () =>
    guarded(async () => {
      const result = await revokeCalendarFeed();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setActive(false);
      setUrl(null);
      toast.success("Calendar link turned off.");
    });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      // No clipboard (insecure context) or permission refused. The link is
      // in a focusable read-only field, so manual copy still works.
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  const offlineNote = "You're offline — connect to manage your calendar link.";

  if (!active) {
    return (
      <div
        className={cn(
          "flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3",
          className,
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !online}
          aria-busy={pending}
          aria-describedby={helperId}
          onClick={rotate}
        >
          <Rss aria-hidden />
          Get subscription link
        </Button>
        <p id={helperId} className="text-xs text-muted-foreground">
          {online ? "A private link your calendar app keeps up to date." : offlineNote}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full max-w-2xl flex-col gap-2", className)}>
      {url ? (
        <>
          <label htmlFor={inputId} className="text-xs font-medium">
            Calendar subscription link
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id={inputId}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-describedby={helperId}
              className="font-mono text-xs"
            />
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <Copy aria-hidden />
                Copy link
              </Button>
              <a
                href={url.replace(/^https?:/, "webcal:")}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <CalendarSync aria-hidden />
                Open in calendar app
              </a>
            </div>
          </div>
          <p id={helperId} className="text-xs text-muted-foreground">
            Shown only this once — copy it now. Anyone with the link can see your
            Watching shows (private entries stay out).
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Live calendar link is on.</span>{" "}
          It&apos;s only shown when it&apos;s made — get a new link to copy it again.
        </p>
      )}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {confirming === "rotate"
              ? "Your current link will stop working; calendars using it stop updating."
              : "Calendars subscribed to this link will stop updating."}
          </p>
          <Button
            type="button"
            variant={confirming === "revoke" ? "destructive" : "default"}
            size="sm"
            disabled={pending || !online}
            aria-busy={pending}
            onClick={confirming === "rotate" ? rotate : revoke}
          >
            {confirming === "rotate" ? "Replace link" : "Turn off link"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            // The safe choice takes focus from the button that just unmounted.
            autoFocus
            onClick={() => setConfirming(null)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !online}
            onClick={() => setConfirming("rotate")}
          >
            <RefreshCw aria-hidden />
            New link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !online}
            onClick={() => setConfirming("revoke")}
          >
            <Unlink aria-hidden />
            Turn off
          </Button>
          {!online && <p className="text-xs text-muted-foreground">{offlineNote}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

const FILENAME = "anime-maniacs-airing.ics";

const SIGNED_OUT = "Sign in again to export your calendar.";
const RATE_LIMITED = "You just exported — try again in a minute.";
const UNAVAILABLE =
  "The airing schedule is unavailable right now. Try again later.";
const FAILED = "Couldn't create the calendar file.";

/**
 * Downloads the user's Watching list as an .ics of weekly JST events from
 * `GET /api/calendar`. The request goes through `fetch` (not a plain
 * `<a download>`) so failures surface as toasts instead of a saved error page.
 *
 * A signed-out request never reaches the route: the auth proxy redirects it to
 * `/login`, which `fetch` follows and returns as a 200 HTML page. So success
 * is a 2xx *with* a `text/calendar` body — anything else that looks fine is
 * treated as an expired session.
 */
export function AddToCalendarButton({ className }: { className?: string }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(false);
  // State re-renders too late to stop a fast double click; the ref doesn't.
  const inFlight = useRef(false);
  const helperId = useId();

  async function exportCalendar() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const res = await fetch("/api/calendar");

      if (res.status === 401 || res.redirected) {
        toast.error(SIGNED_OUT);
        return;
      }
      if (res.status === 429) {
        toast.error(RATE_LIMITED);
        return;
      }
      if (res.status === 503) {
        toast.error(UNAVAILABLE);
        return;
      }
      if (!res.ok) {
        toast.error(FAILED);
        return;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.toLowerCase().includes("text/calendar")) {
        toast.error(SIGNED_OUT);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Calendar file downloaded.");
    } catch {
      toast.error(FAILED);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

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
        onClick={exportCalendar}
      >
        <CalendarPlus aria-hidden />
        Add to calendar
      </Button>
      <p id={helperId} className="text-xs text-muted-foreground">
        {online
          ? "Your Watching shows as weekly events (JST)."
          : "You're offline — connect to export your calendar."}
      </p>
    </div>
  );
}

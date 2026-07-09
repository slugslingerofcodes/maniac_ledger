"use client";

import { useEffect, useState } from "react";
import { Link2, Share2, X } from "lucide-react";
import { toast } from "sonner";

const DISMISS_KEY = "share-banner-dismissed";

/**
 * "Love the site?" share card for the home dashboard. Copy-link always works;
 * the share button uses the native share sheet where available. Dismissal is
 * remembered in localStorage. Renders nothing until mounted so SSR output
 * never disagrees with the stored dismissal.
 */
export function ShareBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.origin);
    toast.success("Link copied — thanks for sharing!");
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "anime_maniacs",
          text: "Track everything you watch.",
          url: window.location.origin,
        });
      } catch {
        /* user closed the share sheet */
      }
    } else {
      await copy();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-lg"
      >
        💜
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Love the site?</p>
        <p className="truncate text-xs text-muted-foreground">
          Share it with your friends!
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link"
        className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
      >
        <Link2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={share}
        aria-label="Share"
        className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
      >
        <Share2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";

import {
  BACKGROUND_OPTIONS,
  BACKGROUND_VIDEO,
  useBackground,
  type BackgroundChoice,
} from "@/hooks/use-background";
import { cn } from "@/lib/utils";

/**
 * Ambient background picker for the profile page. Each tile previews the real
 * thing — the videos play muted in their own tile — so the choice is made by
 * looking rather than by reading a label. Applies immediately and everywhere
 * (the hook is a shared store), and persists per device.
 */
export function BackgroundCard() {
  const [choice, setChoice] = useBackground();

  return (
    <section className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Background
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sets the ambient backdrop across the app.
      </p>

      <div
        role="radiogroup"
        aria-label="Ambient background"
        className="mt-3 grid grid-cols-3 gap-3"
      >
        {BACKGROUND_OPTIONS.map((option) => (
          <BackgroundTile
            key={option.value}
            value={option.value}
            label={option.label}
            description={option.description}
            selected={choice === option.value}
            onSelect={() => setChoice(option.value)}
          />
        ))}
      </div>
    </section>
  );
}

function BackgroundTile({
  value,
  label,
  description,
  selected,
  onSelect,
}: {
  value: BackgroundChoice;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const video = BACKGROUND_VIDEO[value];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative overflow-hidden rounded-lg text-left ring-1 transition",
        selected
          ? "ring-2 ring-primary"
          : "ring-border hover:ring-primary/40",
      )}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-muted">
        {video ? (
          <video
            src={video}
            autoPlay
            loop
            muted
            playsInline
            // Previews are decorative and three play at once — don't let them
            // race the page for bandwidth on arrival.
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          // "Default" has no file to preview; mirror the vortex's own palette.
          <span className="block h-full w-full bg-[radial-gradient(ellipse_at_50%_45%,oklch(0.45_0.12_78),oklch(0.2_0.05_60)_58%,oklch(0.1_0.02_50))]" />
        )}
        {selected ? (
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
      </span>
      <span className="block px-2.5 py-2">
        <span
          className={cn(
            "block text-sm font-medium",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {label}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

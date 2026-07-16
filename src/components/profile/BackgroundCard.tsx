"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus } from "lucide-react";

import {
  BACKGROUND_OPTIONS,
  BACKGROUND_VIDEO,
  fileToBackgroundDataUrl,
  useBackground,
  useCustomBackgroundImage,
  type BackgroundChoice,
} from "@/hooks/use-background";
import { cn } from "@/lib/utils";

/**
 * Ambient background picker for the profile page. Each tile previews the real
 * thing — the videos play muted in their own tile, the custom tile shows the
 * stored picture — so the choice is made by looking rather than by reading a
 * label. Applies immediately and everywhere (the hook is a shared store), and
 * persists per device.
 */
export function BackgroundCard() {
  const [choice, setChoice] = useBackground();
  const [customImage, setCustomImage] = useCustomBackgroundImage();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("That file isn't an image.");
      return;
    }
    try {
      // Downscaled to ≤1920px JPEG so it fits localStorage comfortably.
      setCustomImage(await fileToBackgroundDataUrl(file));
      setUploadError(null);
    } catch {
      setUploadError("Couldn't read that image — try a different file.");
    }
  }

  function onSelect(value: BackgroundChoice) {
    if (value === "custom") {
      // No stored picture yet → selecting the tile asks for one. With one
      // stored, selecting re-applies it; the change-photo chip re-opens the
      // picker.
      if (!customImage) {
        fileInputRef.current?.click();
        return;
      }
    }
    setChoice(value);
  }

  return (
    <section className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Background
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sets the ambient backdrop across the app. Saved on this device.
      </p>

      <div
        role="radiogroup"
        aria-label="Ambient background"
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {BACKGROUND_OPTIONS.map((option) => {
          const selected = choice === option.value;
          const video = BACKGROUND_VIDEO[option.value];
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option.value)}
              className={cn(
                "group relative overflow-hidden rounded-lg text-left ring-1 transition-all",
                selected
                  ? "ring-2 ring-primary"
                  : "ring-border hover:ring-foreground/30",
              )}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                {video ? (
                  <video
                    src={video}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : option.value === "custom" ? (
                  customImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL from localStorage; next/image can't take it
                    <img
                      src={customImage}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                      <ImagePlus className="size-6" aria-hidden />
                    </span>
                  )
                ) : (
                  // Default: a static swatch of the vortex's night-void palette.
                  <div className="size-full bg-[radial-gradient(circle_at_50%_40%,oklch(0.35_0.09_290/60%),oklch(0.15_0.02_280)_70%)]" />
                )}
                {selected ? (
                  <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                ) : null}
              </div>
              <div className="p-2">
                <p className="text-xs font-medium">{option.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {customImage ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Change custom picture…
        </button>
      ) : null}
      {uploadError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {uploadError}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onFilePicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

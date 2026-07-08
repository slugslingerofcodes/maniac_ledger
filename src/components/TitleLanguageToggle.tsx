"use client";

import { useTitleLanguage, type TitleLanguage } from "@/hooks/use-title-language";
import { cn } from "@/lib/utils";

const OPTIONS: { value: TitleLanguage; label: string; hint: string }[] = [
  { value: "english", label: "EN", hint: "Show English titles" },
  { value: "japanese", label: "JP", hint: "Show Japanese (romaji) titles" },
];

/**
 * Sliding EN ⇄ JP segmented switch for the title-language preference. The
 * thumb is a single element translated between halves so the change glides.
 */
export function TitleLanguageToggle({ className }: { className?: string }) {
  const [lang, setLang] = useTitleLanguage();

  return (
    <div
      role="group"
      aria-label="Title language"
      className={cn(
        "relative inline-flex shrink-0 rounded-full bg-muted p-0.5 text-xs font-medium",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary transition-transform duration-200 ease-out",
          lang === "japanese" && "translate-x-full",
        )}
      />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          aria-pressed={lang === o.value}
          onClick={() => setLang(o.value)}
          className={cn(
            "relative z-10 w-12 rounded-full py-1 text-center transition-colors",
            lang === o.value
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

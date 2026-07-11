"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { parseNaturalQuery, type ParsedNlFilters } from "@/app/actions/nl-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * "Describe it" search: free-text like "dark isekai under 25 episodes on
 * Netflix" goes to Gemini, comes back as validated filters, and the parent
 * applies them to the normal filter bar (which then runs the real search).
 */
export function NaturalSearchBox({
  onApply,
}: {
  onApply: (filters: ParsedNlFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function run() {
    const value = text.trim();
    if (value.length < 3) return;
    startTransition(async () => {
      const res = await parseNaturalQuery(value);
      if (res.ok) {
        onApply(res.filters);
        toast.success("Filters applied — tweak them below if needed.");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto mb-6 max-w-2xl">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        >
          <SparklesIcon className="size-3.5" /> Describe what you want to watch
        </button>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SparklesIcon
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary",
                pending && "animate-pulse",
              )}
            />
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='e.g. "a dark isekai under 25 episodes" or "cozy cooking shows"'
              aria-label="Describe what you want to watch"
              disabled={pending}
              className="h-10 rounded-xl pl-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <Button
            type="button"
            className="h-10"
            disabled={pending || text.trim().length < 3}
            onClick={run}
          >
            {pending ? "Thinking…" : "Search"}
          </Button>
        </div>
      )}
    </div>
  );
}

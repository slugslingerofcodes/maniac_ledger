"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { generateRecommendations } from "@/app/actions/recommendations";
import { Button } from "@/components/ui/button";
import { RecommendationCard, type RecItem } from "./RecommendationCard";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function RecommendationsView({
  initial,
  lastGeneratedAt,
}: {
  initial: RecItem[];
  lastGeneratedAt: string | null;
}) {
  const [items, setItems] = useState<RecItem[]>(initial);
  const [generatedAt, setGeneratedAt] = useState<string | null>(lastGeneratedAt);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const res = await generateRecommendations();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems(
        res.recommendations.slice(0, 5).map((r) => ({
          malId: r.malId,
          title: r.title,
          posterUrl: r.posterUrl,
          score: r.score,
          reason: r.reason,
        })),
      );
      setGeneratedAt(new Date().toISOString());
      toast.success("Fresh picks ready.");
    });
  }

  function handleDismiss(malId: number) {
    setItems((prev) => prev.filter((i) => i.malId !== malId));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Picks for you
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Refreshed weekly, generated from anime you&apos;ve rated highly.
          </p>
        </div>
        <RefreshButton
          lastGeneratedAt={generatedAt}
          pending={pending}
          onRefresh={refresh}
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No picks yet. Tap{" "}
          <span className="font-medium text-foreground">Generate picks</span> to
          get started.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.malId ?? item.title}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
                className="shrink-0"
              >
                <RecommendationCard item={item} onDismiss={handleDismiss} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function RefreshButton({
  lastGeneratedAt,
  pending,
  onRefresh,
}: {
  lastGeneratedAt: string | null;
  pending: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  const unlockAt = lastGeneratedAt
    ? new Date(lastGeneratedAt).getTime() + SEVEN_DAYS_MS
    : 0;
  const locked = unlockAt > now;

  // Tick once a second only while we're counting down to the unlock.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const label = pending
    ? "Refreshing…"
    : locked
      ? `Refresh in ${formatRemaining(unlockAt - now)}`
      : lastGeneratedAt
        ? "Refresh"
        : "Generate picks";

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onRefresh}
      disabled={pending || locked}
      className="shrink-0 tabular-nums"
    >
      {label}
    </Button>
  );
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

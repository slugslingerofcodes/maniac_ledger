"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Dices } from "lucide-react";
import { toast } from "sonner";

import { generateRecommendations } from "@/app/actions/recommendations";
import { Button } from "@/components/ui/button";
import type { JikanAnime } from "@/lib/jikan";
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

  // "Surprise me": one click rolls a completely random anime and shows it.
  const [randomPick, setRandomPick] = useState<JikanAnime | null>(null);
  const [randomDegraded, setRandomDegraded] = useState(false);
  const [rolling, setRolling] = useState(false);

  async function rollRandom() {
    setRolling(true);
    try {
      const res = await fetch("/api/anime/random");
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        anime: JikanAnime;
        degraded?: boolean;
      };
      setRandomPick(body.anime);
      setRandomDegraded(Boolean(body.degraded));
    } catch {
      toast.error("Couldn't roll a random anime — try again.");
    } finally {
      setRolling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-gradient text-2xl font-semibold tracking-tight">
            Picks for you
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Refreshed weekly, generated from anime you&apos;ve rated highly.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={rollRandom}
            disabled={rolling}
            className="gap-2"
          >
            <Dices className="size-4" aria-hidden />
            {rolling ? "Rolling…" : "Surprise me"}
          </Button>
          <RefreshButton
            lastGeneratedAt={generatedAt}
            pending={pending}
            onRefresh={refresh}
          />
        </div>
      </div>

      {/* Random roll result */}
      <AnimatePresence>
        {randomPick ? (
          <motion.section
            key={randomPick.mal_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative isolate flex gap-4 overflow-hidden rounded-xl bg-card/70 p-4 ring-1 ring-primary/30"
          >
            {randomPick.images?.jpg?.large_image_url ? (
              <Image
                src={randomPick.images.jpg.large_image_url}
                alt=""
                aria-hidden
                fill
                sizes="800px"
                className="-z-10 object-cover opacity-10 blur-md"
              />
            ) : null}
            <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/10 sm:w-28">
              {randomPick.images?.jpg?.large_image_url ? (
                <Image
                  src={randomPick.images.jpg.large_image_url}
                  alt={randomPick.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                {randomDegraded
                  ? "Random roll · from your catalog (MAL offline)"
                  : "Random roll"}
              </p>
              <h2 className="mt-0.5 line-clamp-1 text-lg font-semibold">
                {randomPick.title_english ?? randomPick.title}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  randomPick.type,
                  randomPick.year != null ? String(randomPick.year) : null,
                  randomPick.episodes != null
                    ? `${randomPick.episodes} ep`
                    : null,
                  randomPick.score != null ? `★ ${randomPick.score}` : null,
                  randomPick.genres?.slice(0, 3).map((g) => g.name).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {randomPick.synopsis ? (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {randomPick.synopsis}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/anime/mal/${randomPick.mal_id}`}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90"
                >
                  View details
                </Link>
                <button
                  type="button"
                  onClick={rollRandom}
                  disabled={rolling}
                  className="rounded-full bg-muted px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                >
                  Roll again
                </button>
                <button
                  type="button"
                  onClick={() => setRandomPick(null)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No picks yet. Tap{" "}
          <span className="font-medium text-foreground">Generate picks</span> to
          get started.
        </div>
      ) : (
        <div className="scrollbar-subtle flex gap-4 overflow-x-auto pb-4">
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

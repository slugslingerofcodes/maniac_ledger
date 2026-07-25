"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import type { CosmosItem } from "@/components/cosmos/PosterCosmos";
import { supportsWebGL } from "@/lib/webgl";

/**
 * three.js is ~150 KB gzipped — far too much to spend on every route. Loading
 * it here, `ssr: false`, keeps it in its own chunk that only /cosmos ever
 * fetches, and keeps WebGL out of the server render entirely.
 */
const PosterCosmos = dynamic(
  () => import("@/components/cosmos/PosterCosmos").then((m) => m.PosterCosmos),
  { ssr: false, loading: () => <CosmosLoading /> },
);

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/*
 * Browser capabilities are external state, so they're read with
 * useSyncExternalStore rather than an effect that calls setState — the latter
 * costs an extra render pass on every mount and trips react-hooks lint.
 * Module-scope subscribe fns keep their identity stable across renders.
 */
const subscribeNever = () => () => {};

function subscribeMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function motionSnapshot(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION).matches;
}

// On the server there is no GL context to probe; assume support so the markup
// matches the dynamic loader, then correct after hydration if it's absent.
const serverSupportsWebGL = () => true;
const serverPrefersMotion = () => false;

export function CosmosStage({ items }: { items: CosmosItem[] }) {
  const supported = useSyncExternalStore(
    subscribeNever,
    supportsWebGL,
    serverSupportsWebGL,
  );
  const reduceMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    serverPrefersMotion,
  );

  if (items.length === 0) {
    return (
      <CosmosMessage title="Your cosmos is empty">
        Add a few titles to your library and they&apos;ll appear here as a
        galaxy you can explore.{" "}
        <Link href="/search" className="text-primary underline">
          Find something to watch
        </Link>
        .
      </CosmosMessage>
    );
  }

  if (!supported) {
    return (
      <CosmosMessage title="This browser can't render the cosmos">
        WebGL isn&apos;t available here.{" "}
        <Link href="/library" className="text-primary underline">
          Browse your library
        </Link>{" "}
        instead — same collection, flat.
      </CosmosMessage>
    );
  }

  return <PosterCosmos items={items} reduceMotion={reduceMotion} />;
}

function CosmosLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground">Assembling your cosmos…</p>
      </div>
    </div>
  );
}

function CosmosMessage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="glass max-w-md rounded-2xl p-6 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

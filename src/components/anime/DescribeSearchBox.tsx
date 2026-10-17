"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { LIBRARY_QUERY_KEY } from "@/app/(app)/library/library-grid-client";
import { identifyAnime, type IdentifiedAnime } from "@/app/actions/identify-anime";
import { addToLibraryByMalId } from "@/app/actions/library";
import { PosterFallback } from "@/components/poster-fallback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const EXAMPLES = [
  "the one where the kid finds a notebook that kills people",
  "girl moves to the countryside, there's a big fuzzy forest thing and a cat bus",
  "guys fight giants by swinging around on ropes, everyone dies",
];

/**
 * "Describe it badly" search.
 *
 * The distinction from the search page's NaturalSearchBox is worth keeping
 * clear in the UI as well as the code: that one takes a specification and
 * fills in filters; this one takes a half-memory and names the show. Title
 * search can't do this at all — a query with none of the title's words in it
 * returns nothing — which is why it lives here next to the other AI feature
 * rather than as another mode on the search page.
 */
export function DescribeSearchBox() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<IdentifiedAnime[] | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    const value = text.trim();
    if (value.length < 8) {
      toast.error("Give it a bit more to go on.");
      return;
    }
    startTransition(async () => {
      const res = await identifyAnime(value);
      if (!res.ok) {
        setResults(null);
        toast.error(res.error);
        return;
      }
      setResults(res.candidates);
    });
  }

  return (
    <section className="mb-10" aria-labelledby="describe-heading">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 id="describe-heading" className="text-lg font-semibold tracking-tight">
          Can&apos;t remember the name?
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe it however badly you like — a scene, a character, how it ended.
      </p>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="that one with the alchemy brothers and the metal armour…"
          aria-label="Describe the anime"
          maxLength={600}
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          <Search className="size-4" aria-hidden />
          {pending ? "Thinking…" : "Find it"}
        </Button>
      </form>

      {results === null && !pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {results ? (
        <ul className="mt-5 flex flex-col gap-3">
          {results.map((item) => (
            <CandidateRow key={`${item.malId}-${item.title}`} item={item} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CandidateRow({ item }: { item: IdentifiedAnime }) {
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  function add() {
    if (item.malId == null) return;
    startTransition(async () => {
      const res = await addToLibraryByMalId(item.malId!);
      if (res.ok) {
        setAdded(true);
        // The library grid is a persisted TanStack cache, so it won't show the
        // new row until its key is invalidated.
        queryClient.invalidateQueries({ queryKey: [LIBRARY_QUERY_KEY] });
        toast.success(`Added ${item.title}.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  const percent =
    item.confidence == null ? null : Math.round(Math.min(1, Math.max(0, item.confidence)) * 100);

  return (
    <li>
      <Card className="flex flex-row items-stretch gap-4 overflow-hidden p-0">
        <div className="relative w-20 shrink-0 overflow-hidden">
          {item.posterUrl ? (
            <Image
              src={item.posterUrl}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <PosterFallback title={item.title} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-3">
          <div className="flex items-baseline gap-2">
            {item.malId != null ? (
              <Link
                href={`/anime/mal/${item.malId}`}
                className="truncate font-medium hover:underline"
              >
                {item.title}
              </Link>
            ) : (
              <span className="truncate font-medium">{item.title}</span>
            )}
            {item.score != null ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                ★ {item.score.toFixed(1)}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">{item.reason}</p>

          <div className="mt-1 flex items-center gap-3">
            {percent != null ? (
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {percent}% sure
              </span>
            ) : null}
            {item.malId != null ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || added}
                onClick={add}
              >
                {added ? "✓ Added" : pending ? "Adding…" : "+ Add"}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </li>
  );
}

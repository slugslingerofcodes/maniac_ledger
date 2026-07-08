import { Badge } from "@/components/ui/badge";
import type { RedditPost } from "@/lib/reddit";

/** Compact "N ago" from a unix-seconds timestamp. */
function timeAgo(seconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  const units: [number, string][] = [
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [size, label] of units) {
    if (diff >= size) return `${Math.floor(diff / size)}${label} ago`;
  }
  return "just now";
}

/** A single r/anime post, linking out to the Reddit thread. */
export function NewsCard({ post }: { post: RedditPost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 rounded-xl bg-card p-4 shadow-[0_8px_30px_-16px_oklch(0_0_0/0.7)] ring-1 ring-foreground/10 transition hover:ring-2 hover:ring-primary/40"
    >
      {post.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumbnail}
          alt=""
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <Badge variant="outline" className="mb-1.5">
          r/anime
        </Badge>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-primary">
          {post.title}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {post.author ? <span className="truncate">u/{post.author}</span> : null}
          <span>{timeAgo(post.createdUtc)}</span>
          <span className="text-primary/80 group-hover:underline">
            Read thread ↗
          </span>
        </div>
      </div>
    </a>
  );
}

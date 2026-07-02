import type { Metadata } from "next";

import { NewsCard } from "@/components/NewsCard";
import { getAnimeHotPosts } from "@/lib/reddit";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "News · anime_maniacs",
  description: "The latest from the r/anime community.",
};

export default async function NewsPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let posts;
  try {
    posts = await getAnimeHotPosts(30);
  } catch {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <Header />
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load community news right now. Please try again later.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Header />
      {posts.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing to show right now.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {posts.map((post) => (
            <NewsCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Community News</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hot on r/anime — updates every few minutes. Tap a story to read the
        thread.
      </p>
    </div>
  );
}

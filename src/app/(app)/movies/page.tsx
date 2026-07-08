import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getTopMovies } from "@/lib/jikan";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Movies · anime_maniacs",
  description: "Top-rated anime movies.",
};

export default async function MoviesPage() {
  // Protected route: redirects to /login when there is no session.
  await requireUser();

  let movies;
  try {
    const res = await getTopMovies(24);
    const seen = new Set<number>();
    movies = res.data.filter((a) => {
      if (seen.has(a.mal_id)) return false;
      seen.add(a.mal_id);
      return true;
    });
  } catch {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Header />
        <p className="mt-6 text-sm text-destructive">
          Couldn&apos;t load movies right now. Please try again later.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Header />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {movies.map((movie, i) => {
          const poster =
            movie.images?.jpg?.large_image_url ??
            movie.images?.jpg?.image_url ??
            null;
          return (
            <Link
              key={movie.mal_id}
              href={`/anime/mal/${movie.mal_id}`}
              className="group flex flex-col gap-2"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-shadow hover:ring-2 hover:ring-primary/40">
                {poster ? (
                  <Image
                    src={poster}
                    alt={movie.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <Badge className="absolute left-2 top-2 border-transparent bg-background/80 font-didot text-foreground backdrop-blur">
                  #{i + 1}
                </Badge>
                {movie.score != null ? (
                  <Badge className="absolute right-2 top-2 border-transparent bg-background/80 text-foreground backdrop-blur">
                    ★ {movie.score}
                  </Badge>
                ) : null}
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                {movie.title_english ?? movie.title}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Anime Movies</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The highest-rated anime films of all time. Tap one to view details or
        add it to your library.
      </p>
    </div>
  );
}

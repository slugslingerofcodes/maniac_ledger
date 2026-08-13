/**
 * Reader for a subreddit's "hot" feed. Reddit blocks its `.json` endpoints for
 * server/datacenter requests (403), but the **RSS/Atom** feed is served (200),
 * so we fetch and parse that. RSS carries title/author/date/link/thumbnail but
 * not score or comment counts. Fetched fresh on every request — the news pages
 * reload each time they're visited.
 *
 * Both sides of the app have a newsstand: the anime broadsheet reads r/anime,
 * the manga one reads r/manga (plus r/LightNovels, since the manga side covers
 * light novels and web novels too).
 */

const rssUrl = (subreddit: string) =>
  `https://www.reddit.com/r/${subreddit}/hot/.rss?limit=40`;

/* -------------------------------------------------------------------------- */
/* Caching                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reddit rate-limits hard, and these pages are now the app's *landing* pages:
 * `/choose` sends both sides to their newsstand, so what used to be an
 * occasional visit is the first request of every session. Fetching live on
 * every one of those — which is what `cache: "no-store"` plus `force-dynamic`
 * did — earns a 429 quickly, and a 429 here renders "the presses jammed"
 * instead of a homepage.
 *
 * Measured while wiring the manga feed up: three feed fetches in close
 * succession, and the third came back 429.
 *
 * So the same shape `jikan.ts` uses for its tier-1 cache, minus the parts that
 * don't apply: a short TTL (a "hot" listing is not meaningfully staler at five
 * minutes), in-flight de-duplication so a burst of concurrent readers costs one
 * request, and a last-good fallback so a rate-limited refresh serves the
 * previous edition rather than an error page. Process-local and lossy by
 * design — it dies with the instance, and that's fine for a newspaper.
 */
const TTL_MS = 5 * 60_000;
/** How long a stale entry may still be served when the refresh fails. */
const LAST_GOOD_MS = 60 * 60_000;

type CacheEntry = { posts: RedditPost[]; at: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RedditPost[]>>();

export interface RedditPost {
  id: string;
  title: string;
  /** Permalink to the Reddit thread. */
  url: string;
  author: string;
  thumbnail: string | null;
  /** Unix seconds. */
  createdUtc: number;
  /** Which subreddit it came from — shown as the dateline on merged feeds. */
  subreddit: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function firstMatch(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m ? m[1].trim() : null;
}

/**
 * Hot posts from one subreddit (via its Atom feed), newest hotness first.
 * Served from the process-local cache when fresh; a failed refresh falls back
 * to the last good edition before giving up.
 * @throws only when there is nothing cached *and* the fetch fails.
 */
export async function getSubredditHotPosts(
  subreddit: string,
  limit = 30,
): Promise<RedditPost[]> {
  const key = subreddit.toLowerCase();
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return cached.posts.slice(0, limit);

  // A burst of readers hitting a cold cache should cost one request, not one
  // each — which is exactly how the 429 above happened.
  const pending = inFlight.get(key);
  if (pending) return (await pending).slice(0, limit);

  const request = fetchSubreddit(subreddit)
    .then((posts) => {
      cache.set(key, { posts, at: Date.now() });
      return posts;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);

  try {
    return (await request).slice(0, limit);
  } catch (err) {
    // Rate-limited or down: yesterday's paper beats no paper.
    if (cached && now - cached.at < LAST_GOOD_MS) {
      return cached.posts.slice(0, limit);
    }
    throw err;
  }
}

/** The uncached fetch + parse. Always returns the full feed; callers slice. */
async function fetchSubreddit(subreddit: string): Promise<RedditPost[]> {
  const res = await fetch(rssUrl(subreddit), {
    headers: {
      "User-Agent": "Mozilla/5.0 anime_maniacs/1.0 (+news tab)",
      Accept: "application/atom+xml, application/xml, text/xml",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Reddit request failed (${res.status})`);
  }

  const xml = await res.text();
  const entries = xml
    .split("<entry>")
    .slice(1)
    .map((chunk) => chunk.split("</entry>")[0]);

  const posts: RedditPost[] = [];
  // No slice here — the cache stores the full feed so a later call with a
  // larger `limit` isn't capped by whichever caller happened to warm it.
  for (const entry of entries) {
    const title = firstMatch(/<title>([\s\S]*?)<\/title>/, entry);
    const link = firstMatch(/<link[^>]*href="([^"]+)"/, entry);
    if (!title || !link) continue;

    const id = firstMatch(/<id>([\s\S]*?)<\/id>/, entry) ?? link;
    const author = firstMatch(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/, entry);
    const updated =
      firstMatch(/<updated>([\s\S]*?)<\/updated>/, entry) ??
      firstMatch(/<published>([\s\S]*?)<\/published>/, entry);
    const content =
      firstMatch(/<content[^>]*>([\s\S]*?)<\/content>/, entry) ?? "";
    // Prefer the Atom <media:thumbnail> (reliable, direct CDN URL); fall back
    // to the first <img> embedded in the post's HTML content. Entity-decode
    // both — Reddit escapes "&" in query strings, which breaks the URL as-is.
    const mediaThumb = firstMatch(/<media:thumbnail[^>]+url="([^"]+)"/, entry);
    const thumb = mediaThumb
      ? decodeEntities(mediaThumb)
      : firstMatch(/<img[^>]+src="([^"]+)"/, decodeEntities(content));

    posts.push({
      id,
      title: decodeEntities(title),
      url: link,
      author: (author ?? "").replace(/^\/u\//, ""),
      thumbnail: thumb && /^https?:\/\//.test(thumb) ? thumb : null,
      createdUtc: updated
        ? Math.floor(new Date(updated).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      subreddit,
    });
  }

  return posts;
}

/** Hot posts from r/anime — the anime side's newsstand. */
export async function getAnimeHotPosts(limit = 30): Promise<RedditPost[]> {
  return getSubredditHotPosts("anime", limit);
}

/**
 * Hot posts for the manga side: r/manga as the spine, topped up with
 * r/LightNovels so light and web novels — which the manga side also tracks —
 * aren't shut out of their own newspaper.
 *
 * Deliberately tolerant: if one subreddit is unreachable the other still
 * prints. Only a total failure throws, so the page's catch means "nothing at
 * all is available", not "one feed hiccuped".
 */
export async function getMangaHotPosts(limit = 30): Promise<RedditPost[]> {
  // Sequential, not `Promise.all`: two simultaneous requests from one IP is
  // precisely the burst that returned 429 when this was first wired up.
  // r/manga is the spine, so it goes first and its failure is the real
  // failure; the novels feed is a garnish fetched only after.
  const manga = await getSubredditHotPosts("manga", limit).catch(() => null);

  let novels: RedditPost[] = [];
  try {
    novels = await getSubredditHotPosts("LightNovels", Math.ceil(limit / 3));
  } catch {
    // Best-effort — the paper prints without the novels column.
  }

  const posts = [...(manga ?? []), ...novels];
  if (posts.length === 0) {
    throw new Error("Reddit request failed for both manga feeds");
  }

  // Interleave by recency so the novel posts don't all clump at the end.
  return posts.sort((a, b) => b.createdUtc - a.createdUtc).slice(0, limit);
}

/**
 * Reader for the r/anime "hot" feed. Reddit blocks its `.json` endpoints for
 * server/datacenter requests (403), but the **RSS/Atom** feed is served (200),
 * so we fetch and parse that. RSS carries title/author/date/link/thumbnail but
 * not score or comment counts. Fetched fresh on every request — the news page
 * reloads each time it's visited.
 */

const REDDIT_RSS_URL = "https://www.reddit.com/r/anime/hot/.rss?limit=40";

export interface RedditPost {
  id: string;
  title: string;
  /** Permalink to the Reddit thread. */
  url: string;
  author: string;
  thumbnail: string | null;
  /** Unix seconds. */
  createdUtc: number;
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
 * Hot posts from r/anime (via the Atom feed), newest hotness first.
 * @throws on a non-2xx response.
 */
export async function getAnimeHotPosts(limit = 30): Promise<RedditPost[]> {
  const res = await fetch(REDDIT_RSS_URL, {
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
  for (const entry of entries.slice(0, limit)) {
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
    });
  }

  return posts;
}

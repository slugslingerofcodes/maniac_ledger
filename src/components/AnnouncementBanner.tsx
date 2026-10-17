import { AnnouncementBannerView } from "@/components/AnnouncementBannerView";
import { createClient } from "@/lib/supabase/server";

/**
 * Slim banner under the nav showing the latest active announcement (RLS lets
 * any signed-in user see active ones). Dismissal is per-announcement,
 * remembered in localStorage — see `AnnouncementBannerView`.
 *
 * Read on the server, and rendered by the layouts behind a Suspense boundary
 * so the query never holds a route. It used to be a client component that
 * built the browser Supabase client on mount just to read this one row, which
 * put ~62 KB gzipped of supabase-js into every authed route's first-load JS
 * and only started the fetch after hydration. Never throws: no banner is
 * always an acceptable outcome.
 */
export async function AnnouncementBanner() {
  const announcement = await latestAnnouncement();
  return announcement ? (
    <AnnouncementBannerView announcement={announcement} />
  ) : null;
}

async function latestAnnouncement() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

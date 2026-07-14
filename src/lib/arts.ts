/**
 * Shared shapes for the anime art gallery. Kept out of the server-action
 * module: "use server" files may only export async functions, so runtime
 * constants live here where both the action and the client page can import
 * them.
 */

export const ART_CATEGORIES = ["neko", "waifu", "kitsune", "husbando"] as const;
export type ArtCategory = (typeof ART_CATEGORIES)[number];

export type ArtPiece = {
  url: string;
  artistName: string | null;
  artistHref: string | null;
  sourceUrl: string | null;
};

/** A fan-art post from the imageboard source (Safebooru — all SFW-rated). */
export type FanArt = {
  id: number;
  /** Grid-sized image (sample), falling back to the full file. */
  url: string;
  /** Full-resolution file for the lightbox. */
  fullUrl: string;
  /** The Safebooru post page (credits/source live there). */
  postUrl: string;
  score: number | null;
};

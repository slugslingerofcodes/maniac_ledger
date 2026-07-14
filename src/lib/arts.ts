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

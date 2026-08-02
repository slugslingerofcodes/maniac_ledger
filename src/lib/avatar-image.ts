/**
 * Avatar downscaling, done in the browser before upload.
 *
 * Profile pictures went into storage exactly as chosen — up to the 2 MB limit —
 * and came back out at full size on every page, because the nav avatar is
 * `user_metadata.avatar_url` rendered directly. A Lighthouse run on the home
 * page caught one at **255 KB**, which made a single avatar heavier than any
 * poster on a page full of posters.
 *
 * Resizing here rather than on read is deliberate: the file lands in Supabase
 * storage on an origin the poster rewriter can't touch (and shouldn't — it only
 * knows the two catalog CDNs), and Supabase's own image transformations are a
 * paid add-on. Shrinking once at upload costs nothing and needs no new service.
 */

/**
 * Stored edge length. Avatars render at 32px in the nav and 64px on the profile;
 * the only large use is the click-to-zoom lightbox, and 512px covers that on a
 * 3× phone screen with room to spare.
 */
export const AVATAR_SIZE = 512;

/** WebP quality. 0.85 is indistinguishable at avatar sizes and roughly halves 0.95. */
const AVATAR_QUALITY = 0.85;

export type CropRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * The source rectangle that fills a square without distorting the image —
 * the same centre-crop the UI already applies with `object-cover`, so cropping
 * at upload changes no pixel the user was actually shown.
 *
 * Pure, and separated from the canvas work so the geometry can be tested: an
 * off-by-one here silently shifts every face slightly off-centre, which is the
 * kind of thing nobody notices until every avatar looks subtly wrong.
 */
export function coverCrop(srcW: number, srcH: number): CropRect {
  const edge = Math.min(srcW, srcH);
  return {
    sx: Math.round((srcW - edge) / 2),
    sy: Math.round((srcH - edge) / 2),
    sw: edge,
    sh: edge,
  };
}

export type PreparedAvatar = {
  blob: Blob;
  contentType: string;
  /** File extension to store under, matching `contentType`. */
  ext: string;
};

/**
 * Downscale `file` to a square WebP suitable for storage.
 *
 * Falls back to the original file whenever anything goes wrong — an image the
 * browser can't decode (HEIC from an iPhone is the common one), a canvas that
 * refuses to encode WebP, a tainted context. A failed optimisation must never
 * become a failed upload; the worst case is simply the old behaviour.
 */
export async function prepareAvatar(
  file: File,
  size = AVATAR_SIZE,
): Promise<PreparedAvatar> {
  const original: PreparedAvatar = {
    blob: file,
    contentType: file.type || "image/png",
    ext: file.name.split(".").pop()?.toLowerCase() || "png",
  };

  try {
    // `from-image` applies EXIF orientation; without it, photos taken in
    // portrait on a phone upload rotated 90°.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    // Never upscale a small picture into a bigger file.
    const edge = Math.min(size, bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;

    const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, edge, edge);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", AVATAR_QUALITY),
    );
    // A browser without WebP encoding returns null, or silently hands back a
    // PNG — either way, only take the result if it actually saves bytes.
    if (!blob || blob.size >= file.size) return original;

    return { blob, contentType: "image/webp", ext: "webp" };
  } catch {
    return original;
  }
}

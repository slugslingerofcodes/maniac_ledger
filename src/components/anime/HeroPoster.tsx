"use client";

import Image from "next/image";

import { PosterLightbox } from "@/components/PosterLightbox";
import { Tilt3D } from "@/components/Tilt3D";

/**
 * The detail-page hero poster as a physical object: it idles on a slow float
 * (CSS `hero-float`, motion-safe only), tilts toward the pointer with a
 * specular sheen, and casts a shadow that shifts opposite the light. Keeps
 * the `data-vtn` morph target and click-to-zoom lightbox behavior intact —
 * the float/tilt live on ancestors of the named element, so the poster morph
 * still captures and animates it normally.
 */
export function HeroPoster({
  src,
  title,
  transitionName,
}: {
  src: string;
  title: string;
  transitionName: string;
}) {
  return (
    <PosterLightbox src={src} alt={title}>
      <div className="hero-float">
        <Tilt3D maxTilt={13} scale={1.04} shadow className="rounded-xl">
          <div
            data-vtn={transitionName}
            style={{ viewTransitionName: transitionName }}
            className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted shadow-xl ring-1 ring-foreground/10"
          >
            <Image
              src={src}
              alt={title}
              fill
              priority
              sizes="(max-width: 640px) 160px, 208px"
              className="object-cover"
            />
          </div>
        </Tilt3D>
      </div>
    </PosterLightbox>
  );
}

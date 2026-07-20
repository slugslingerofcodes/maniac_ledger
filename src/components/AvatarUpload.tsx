"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PosterLightbox } from "@/components/PosterLightbox";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Profile-picture picker. Uploads to the `avatars` bucket (one folder per
 * user, migration 0012), then stores the public URL in
 * user_metadata.avatar_url — the nav avatar updates live via USER_UPDATED.
 */
export function AvatarUpload({
  userId,
  initialUrl,
  fallbackInitial,
}: {
  userId: string;
  initialUrl: string | null;
  fallbackInitial: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image shows immediately despite CDN caching.
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });
      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      setUrl(publicUrl);
      toast.success("Profile picture updated.");
    });
  }

  return (
    <div className="flex items-center gap-4">
      {/* Click-to-zoom: the picture opens as a circular holo card — the same
          tilt-and-sheen treatment posters get, clipped to a circle. */}
      {url ? (
        <PosterLightbox
          src={url}
          alt="you"
          round
          triggerClassName="w-auto rounded-full transition hover:ring-2 hover:ring-primary/40"
        >
          <Avatar className="size-16 ring-1 ring-foreground/10">
            <AvatarImage src={url} alt="Your profile picture" />
            <AvatarFallback className="text-lg">{fallbackInitial}</AvatarFallback>
          </Avatar>
        </PosterLightbox>
      ) : (
        <Avatar className="size-16 ring-1 ring-foreground/10">
          <AvatarFallback className="text-lg">{fallbackInitial}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Uploading…" : url ? "Change picture" : "Upload picture"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG/PNG/WebP, up to 2 MB.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

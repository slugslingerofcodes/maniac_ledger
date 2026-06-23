"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets the signed-in user set a display username, stored in Supabase
 * `user_metadata.username`. Updating fires an auth `USER_UPDATED` event, so the
 * nav (which reads the user via `useUser`) reflects the new name immediately.
 */
export function UsernameForm({ initialUsername }: { initialUsername: string }) {
  const [username, setUsername] = useState(initialUsername);
  const [pending, startTransition] = useTransition();

  const trimmed = username.trim();
  const dirty = trimmed !== initialUsername.trim();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { username: trimmed },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(trimmed ? "Username updated." : "Username cleared.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Label htmlFor="username">Username</Label>
      <div className="flex gap-2">
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Pick a username"
          maxLength={32}
          autoComplete="username"
        />
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown in the top bar instead of your email.
      </p>
    </form>
  );
}

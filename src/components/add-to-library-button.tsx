"use client";

import { useState, useTransition } from "react";

import {
  addToLibrary,
  type AddToLibraryInput,
} from "@/app/search/actions";
import { Button } from "@/components/ui/button";

type AddStatus = "idle" | "added" | "already_in_library" | "error";

export function AddToLibraryButton({ item }: { item: AddToLibraryInput }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<AddStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const done = status === "added" || status === "already_in_library";

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await addToLibrary(item);
      if (result.ok) {
        setStatus(result.status);
      } else {
        setStatus("error");
        setMessage(result.error);
      }
    });
  }

  const label = pending
    ? "Adding…"
    : status === "added"
      ? "Added ✓"
      : status === "already_in_library"
        ? "In Library"
        : "Add to Library";

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={done ? "secondary" : "default"}
        className="w-full"
        disabled={pending || done}
        onClick={onClick}
      >
        {label}
      </Button>
      {status === "error" && message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}
    </div>
  );
}

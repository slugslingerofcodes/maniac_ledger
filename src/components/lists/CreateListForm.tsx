"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createList } from "@/app/actions/lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateListForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createList(trimmed);
      if (res.ok) {
        setName("");
        setOpen(false);
        router.refresh();
        if (res.listId) router.push(`/lists/${res.listId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon className="mr-1.5 size-3.5" /> New list
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name"
        aria-label="List name"
        disabled={pending}
        className="h-9 w-48"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button
        type="button"
        size="sm"
        className="h-9"
        disabled={pending || name.trim().length === 0}
        onClick={submit}
      >
        {pending ? "Creating…" : "Create"}
      </Button>
    </div>
  );
}

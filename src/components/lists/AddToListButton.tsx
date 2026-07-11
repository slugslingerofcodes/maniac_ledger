"use client";

import { useState, useTransition } from "react";
import { CheckIcon, ListPlusIcon } from "lucide-react";
import { toast } from "sonner";

import {
  addToList,
  createList,
  getMyLists,
  removeFromList,
  type MyListSummary,
} from "@/app/actions/lists";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * "Add to list" menu on anime detail pages. Lists load lazily on first open;
 * clicking a list toggles membership; the footer row creates a new list with
 * the anime already in it.
 */
export function AddToListButton({ animeId }: { animeId: string }) {
  const [lists, setLists] = useState<MyListSummary[] | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      setLists(await getMyLists(animeId));
    });
  }

  function toggle(list: MyListSummary) {
    startTransition(async () => {
      const res = list.hasAnime
        ? await removeFromList(list.id, animeId)
        : await addToList(list.id, animeId);
      if (res.ok) {
        setLists(await getMyLists(animeId));
      } else {
        toast.error(res.error);
      }
    });
  }

  function createAndAdd() {
    const name = window.prompt("New list name:");
    if (!name?.trim()) return;
    startTransition(async () => {
      const res = await createList(name.trim());
      if (!res.ok || !res.listId) {
        toast.error(res.ok ? "Couldn't create the list." : res.error);
        return;
      }
      const added = await addToList(res.listId, animeId);
      if (!added.ok) toast.error(added.error);
      setLists(await getMyLists(animeId));
    });
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && lists == null && load()}>
      <DropdownMenuTrigger
        aria-label="Add to list"
        className={cn(
          "mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-transparent text-sm font-medium transition-colors hover:bg-muted",
        )}
      >
        <ListPlusIcon className="size-4" /> Add to list
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Your lists</DropdownMenuLabel>
        {lists == null ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : lists.length === 0 ? (
          <DropdownMenuItem disabled>No lists yet</DropdownMenuItem>
        ) : (
          lists.map((list) => (
            <DropdownMenuItem
              key={list.id}
              closeOnClick={false}
              disabled={pending}
              onClick={() => toggle(list)}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded border",
                  list.hasAnime
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {list.hasAnime ? <CheckIcon className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
              <span className="text-xs text-muted-foreground">
                {list.itemCount}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={createAndAdd}>
          + New list…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
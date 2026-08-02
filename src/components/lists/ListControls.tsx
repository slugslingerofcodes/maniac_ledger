"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlobeIcon, LinkIcon, LockIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteList, removeFromList, setListPublic } from "@/app/actions/lists";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/** Owner toolbar on a list detail page: visibility, share link, delete. */
export function ListOwnerBar({
  listId,
  isPublic,
}: {
  listId: string;
  isPublic: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Local mirror of the server prop so the label flips on click. Re-synced
  // whenever the server sends a new value (React's derived-state pattern).
  const [publicNow, setPublicNow] = useState(isPublic);
  const [prevProp, setPrevProp] = useState(isPublic);
  if (prevProp !== isPublic) {
    setPrevProp(isPublic);
    setPublicNow(isPublic);
  }
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const next = !publicNow;
          setPublicNow(next);
          startTransition(async () => {
            const res = await setListPublic(listId, next);
            if (res.ok) {
              router.refresh();
            } else {
              setPublicNow(!next);
              toast.error(res.error);
            }
          });
        }}
      >
        {publicNow ? (
          <>
            <GlobeIcon className="mr-1.5 size-3.5" /> Public
          </>
        ) : (
          <>
            <LockIcon className="mr-1.5 size-3.5" /> Private
          </>
        )}
      </Button>
      {publicNow ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied.");
          }}
        >
          <LinkIcon className="mr-1.5 size-3.5" /> Copy link
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this list? Its entries are removed too.")) {
            return;
          }
          startTransition(async () => {
            const res = await deleteList(listId);
            if (res.ok) {
              toast.success("List deleted.");
              router.push("/lists");
              router.refresh();
            } else {
              toast.error(res.error);
            }
          });
        }}
      >
        <Trash2Icon className="mr-1.5 size-3.5" /> Delete
      </Button>
    </div>
  );
}

/**
 * Small ✕ on each card (owner only) that removes the anime from the list.
 * The card collapses out immediately; `router.refresh()` then reconciles the
 * server-rendered grid behind it, and a failure restores the card.
 */
export function RemoveFromListButton({
  listId,
  animeId,
}: {
  listId: string;
  animeId: string;
}) {
  const [, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);
  const router = useRouter();

  return (
    <>
      {removed ? (
        <span
          aria-hidden
          className="absolute inset-0 z-20 rounded-lg bg-background/70 backdrop-blur-sm"
        />
      ) : null}
      <Tooltip label="Remove from list">
      <button
        type="button"
        aria-label="Remove from list"
        disabled={removed}
        onClick={(e) => {
          e.preventDefault();
          setRemoved(true);
          startTransition(async () => {
            const res = await removeFromList(listId, animeId);
            if (res.ok) {
              router.refresh();
            } else {
              setRemoved(false);
              toast.error(res.error);
            }
          });
        }}
        className="absolute right-2 top-2 z-30 grid size-7 place-items-center rounded-full bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-destructive"
      >
        <XIcon className="size-4" />
      </button>
      </Tooltip>
    </>
  );
}

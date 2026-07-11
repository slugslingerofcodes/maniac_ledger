"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlobeIcon, LinkIcon, LockIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { deleteList, removeFromList, setListPublic } from "@/app/actions/lists";
import { Button } from "@/components/ui/button";

/** Owner toolbar on a list detail page: visibility, share link, delete. */
export function ListOwnerBar({
  listId,
  isPublic,
}: {
  listId: string;
  isPublic: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setListPublic(listId, !isPublic);
            if (res.ok) router.refresh();
            else toast.error(res.error);
          })
        }
      >
        {isPublic ? (
          <>
            <GlobeIcon className="mr-1.5 size-3.5" /> Public
          </>
        ) : (
          <>
            <LockIcon className="mr-1.5 size-3.5" /> Private
          </>
        )}
      </Button>
      {isPublic ? (
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

/** Small ✕ on each card (owner only) that removes the anime from the list. */
export function RemoveFromListButton({
  listId,
  animeId,
}: {
  listId: string;
  animeId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Remove from list"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await removeFromList(listId, animeId);
          if (res.ok) router.refresh();
          else toast.error(res.error);
        });
      }}
      className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-destructive"
    >
      <XIcon className="size-4" />
    </button>
  );
}

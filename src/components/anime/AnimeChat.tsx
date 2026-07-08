"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { getDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
};

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const MAX_MESSAGES = 100;

/**
 * Per-anime discussion room. Loads the latest messages, streams new ones live
 * via Realtime (postgres_changes INSERT, filtered to this anime — needs
 * migration 0013's publication entry), and lets users post as themselves and
 * delete their own messages. RLS enforces authorship server-side.
 */
export function AnimeChat({ animeId }: { animeId: string }) {
  const { user, loading } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load + live INSERT/DELETE stream for this room.
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase
      .from("anime_chat_messages")
      .select("id, user_id, username, body, created_at")
      .eq("anime_id", animeId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setUnavailable(true);
          return;
        }
        setMessages((data ?? []).reverse());
      });

    const channel = supabase
      .channel(`anime-chat-${animeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "anime_chat_messages",
          filter: `anime_id=eq.${animeId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id)
              ? prev
              : [...prev, msg].slice(-MAX_MESSAGES),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "anime_chat_messages",
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [animeId]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !user) return;
    setDraft("");

    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("anime_chat_messages")
        .insert({ anime_id: animeId, username: getDisplayName(user), body })
        .select("id, user_id, username, body, created_at")
        .single();
      if (error) {
        setDraft(body); // give the text back
        toast.error(error.message);
        return;
      }
      // Realtime will also deliver this; the id check dedupes.
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data],
      );
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("anime_chat_messages")
        .delete()
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  }

  if (unavailable) {
    return (
      <p className="text-sm text-muted-foreground">
        Chat isn&apos;t available right now.
      </p>
    );
  }

  return (
    <div className="flex flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      <div
        ref={scrollRef}
        className="flex max-h-80 min-h-40 flex-col gap-2.5 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-muted-foreground">
            No messages yet — start the conversation.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user?.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "group flex max-w-[85%] flex-col gap-0.5",
                  mine ? "self-end items-end" : "self-start items-start",
                )}
              >
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {mine ? "You" : m.username}
                  </span>
                  <span>{TIME_FMT.format(new Date(m.created_at))}</span>
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      aria-label="Delete message"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <XIcon className="size-3" />
                    </button>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm",
                    mine
                      ? "rounded-br-sm bg-primary/90 text-primary-foreground"
                      : "rounded-bl-sm bg-muted",
                  )}
                >
                  {m.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-3">
        {user ? (
          <form onSubmit={send} className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share your thoughts…"
              maxLength={500}
              aria-label="Chat message"
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              Send
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loading ? (
              " "
            ) : (
              <>
                <Link href="/login" className="text-foreground underline">
                  Sign in
                </Link>{" "}
                to join the discussion.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

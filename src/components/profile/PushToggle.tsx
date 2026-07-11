"use client";

import { useEffect, useState, useTransition } from "react";
import { BellIcon, BellOffIcon } from "lucide-react";
import { toast } from "sonner";

import {
  hasPushSubscription,
  removePushSubscription,
  savePushSubscription,
} from "@/app/actions/push";
import { Button } from "@/components/ui/button";

/** Base64url VAPID key → the BufferSource applicationServerKey wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "unsupported" // browser has no Push API, or no SW registered (dev)
  | "no-key" // NEXT_PUBLIC_VAPID_PUBLIC_KEY missing
  | "off"
  | "on"
  | "loading";

/**
 * Device-level push toggle for airing reminders. The service worker only
 * registers in production builds, so in dev this reports unsupported.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [pending, startTransition] = useTransition();
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (!vapidKey) {
        if (!cancelled) setState("no-key");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        if (!cancelled) setState("off");
        return;
      }
      const known = await hasPushSubscription(sub.endpoint);
      if (!cancelled) setState(known ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.error("Notifications are blocked for this site.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey!),
          }));
        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          toast.error("Couldn't read the push subscription.");
          return;
        }
        const res = await savePushSubscription({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });
        if (res.ok) {
          setState("on");
          toast.success("Push notifications enabled on this device.");
        } else {
          toast.error(res.error);
        }
      } catch {
        toast.error("Couldn't enable push notifications.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        toast.success("Push notifications disabled on this device.");
      } catch {
        toast.error("Couldn't disable push notifications.");
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Push notifications
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {state === "on"
            ? "Airing reminders arrive as push notifications on this device."
            : state === "off"
              ? "Get “airs today” reminders as push notifications."
              : state === "no-key"
                ? "Server push keys aren't configured yet."
                : state === "loading"
                  ? "Checking this device…"
                  : "Not available here — install the app / use a production build."}
        </p>
        {state === "on" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={disable}
          >
            <BellOffIcon className="mr-1.5 size-3.5" /> Disable
          </Button>
        ) : state === "off" ? (
          <Button type="button" size="sm" disabled={pending} onClick={enable}>
            <BellIcon className="mr-1.5 size-3.5" /> Enable
          </Button>
        ) : null}
      </div>
    </div>
  );
}

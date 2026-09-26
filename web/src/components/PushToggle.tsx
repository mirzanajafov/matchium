"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";
import { decodeKey, toPayload } from "@/lib/push";

type Status = "checking" | "unsupported" | "blocked" | "off" | "on" | "working" | "failed";

const HINTS: Record<Status, string> = {
  checking: "",
  unsupported: "This browser can't show notifications from websites.",
  blocked: "Notifications are blocked for this site. You can allow them in your browser settings.",
  off: "Get a nudge when your matches are ready, when it's mutual, and when someone writes.",
  on: "You'll hear from us about new matches and messages on this device.",
  working: "",
  failed: "Something went wrong. Try again in a moment.",
};

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const settle = (next: Status) => {
      if (active) setStatus(next);
    };
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      settle("unsupported");
      return;
    }
    registration()
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (subscription) => {
        const payload = subscription && toPayload(subscription);
        if (payload) {
          await savePushSubscription(payload);
          settle("on");
        } else {
          settle(Notification.permission === "denied" ? "blocked" : "off");
        }
      })
      .catch(() => settle("failed"));
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setStatus("working");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setStatus(Notification.permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });
      const payload = toPayload(subscription);
      if (!payload) throw new Error("Incomplete subscription");
      await savePushSubscription(payload);
      setStatus("on");
    } catch {
      setStatus("failed");
    }
  }

  async function disable() {
    setStatus("working");
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setStatus("failed");
    }
  }

  const on = status === "on";
  const shown = status === "on" || status === "off" || status === "failed" || status === "working";

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium">Notifications</h2>
        <p className="mt-1 text-sm text-muted" role="status">
          {HINTS[status]}
        </p>
      </div>
      {shown && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Notifications"
          disabled={status === "working"}
          onClick={on ? disable : enable}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              on ? "translate-x-5" : ""
            }`}
          />
        </button>
      )}
    </div>
  );
}

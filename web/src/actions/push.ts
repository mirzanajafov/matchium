"use server";

import { authedApi } from "@/lib/api";
import type { PushSubscriptionPayload } from "@/lib/push";
import { rememberPushEndpoint } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { attempt } from "./attempt";

const FAILED = "Something went wrong. Try again in a moment.";

export async function savePushSubscription(subscription: PushSubscriptionPayload): Promise<ActionResult> {
  const saved = await attempt(async () => {
    await authedApi("/push/subscriptions", { body: subscription });
  }, FAILED);
  if (saved.ok) await rememberPushEndpoint(subscription.endpoint);
  return saved;
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const removed = await attempt(async () => {
    await authedApi("/push/subscriptions", { method: "DELETE", body: { endpoint } });
  }, FAILED);
  if (removed.ok) await rememberPushEndpoint(null);
  return removed;
}

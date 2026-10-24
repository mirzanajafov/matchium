"use server";

import { authedApi } from "@/lib/api";
import type { ActionResult, ChatMessage } from "@/lib/types";
import { attempt } from "./attempt";

export async function sendMessage(matchId: string, body: string): Promise<ActionResult<ChatMessage>> {
  return attempt(
    () => authedApi<ChatMessage>(`/chats/${encodeURIComponent(matchId)}/messages`, { body: { body } }),
    "Message didn't go through. Try again.",
    { 429: "You're sending messages too fast. Wait a moment." },
  );
}

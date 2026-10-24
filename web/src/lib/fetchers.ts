import type { ChatMessage, Conversation, Inbox } from "./types";

export class SessionExpiredError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 401) throw new SessionExpiredError(`${url} answered 401`);
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as T;
}

export function fetchInbox(): Promise<Inbox> {
  return getJson<Inbox>("/api/inbox");
}

export async function fetchMessages(matchId: string, after?: string): Promise<ChatMessage[]> {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const conversation = await getJson<Conversation>(`/api/chats/${encodeURIComponent(matchId)}/messages${query}`);
  return conversation.messages;
}

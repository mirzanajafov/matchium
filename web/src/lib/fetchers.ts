import type { ChatMessage, ChatThread, Inbox } from "./types";

export class SessionExpired extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 401) throw new SessionExpired(`${url} answered 401`);
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as T;
}

export function fetchInbox(): Promise<Inbox> {
  return getJson<Inbox>("/api/inbox");
}

export async function fetchMessages(matchId: string, after?: string): Promise<ChatMessage[]> {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const thread = await getJson<ChatThread>(`/api/chats/${encodeURIComponent(matchId)}/messages${query}`);
  return thread.messages;
}

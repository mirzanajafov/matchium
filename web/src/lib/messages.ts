import type { ChatMessage } from "./types";

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const known = new Set(current.map((m) => m.id));
  const unseen = incoming.filter((m) => !known.has(m.id));
  if (unseen.length === 0) return current;
  return [...current, ...unseen].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

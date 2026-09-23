import type { Metadata } from "next";
import Link from "next/link";
import { authedApi } from "@/lib/api";
import type { ChatSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Chats" };

export default async function ChatsPage() {
  const chats = await authedApi<ChatSummary[]>("/chats");

  return (
    <>
      <h1 className="text-2xl font-semibold">Chats</h1>
      {chats.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-muted">
          When you and a match both say yes, you can talk here.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {chats.map((chat) => (
            <li key={chat.id}>
              <Link href={`/chats/${chat.id}`} className="block px-5 py-4 hover:bg-background">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">
                    {chat.person.displayName}, {chat.person.age}
                  </span>
                  <span className="text-xs text-muted">matched {chat.matchedOn}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {chat.lastMessage
                    ? `${chat.lastMessage.fromMe ? "You: " : ""}${chat.lastMessage.body}`
                    : "No messages yet. Say hi."}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

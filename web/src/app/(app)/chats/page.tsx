import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { authedApi } from "@/lib/api";
import { shortDate } from "@/lib/format";
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
              <Link href={`/chats/${chat.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-background">
                <Avatar name={chat.person.displayName} photo={chat.person.photo} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className={`flex items-center gap-2 ${chat.unread ? "font-semibold" : "font-medium"}`}>
                      {chat.unread && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
                      {chat.person.displayName}, {chat.person.age}
                    </span>
                    <span className="text-xs text-muted">matched {shortDate(chat.matchedOn)}</span>
                  </div>
                  <p className={`mt-0.5 truncate text-sm ${chat.unread ? "text-foreground" : "text-muted"}`}>
                    {chat.lastMessage
                      ? `${chat.lastMessage.fromMe ? "You: " : ""}${chat.lastMessage.body}`
                      : "No messages yet. Say hi."}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

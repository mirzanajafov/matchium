import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ChatThread } from "@/components/ChatThread";
import { UnmatchPanel } from "@/components/UnmatchPanel";
import { ApiError, authedApi } from "@/lib/api";
import type { Conversation } from "@/lib/types";

export const metadata: Metadata = { title: "Chat" };

async function loadConversation(id: string): Promise<Conversation> {
  try {
    return await authedApi<Conversation>(`/chats/${encodeURIComponent(id)}/messages`);
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404].includes(error.status)) notFound();
    throw error;
  }
}

export default async function ChatPage({ params }: PageProps<"/chats/[id]">) {
  const { id } = await params;
  const conversation = await loadConversation(id);

  return (
    <>
      <Link href="/chats" className="text-sm text-muted hover:text-foreground">
        All chats
      </Link>
      <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
        <Avatar name={conversation.person.displayName} photo={conversation.person.photo} size={40} />
        {conversation.person.displayName}
      </h1>
      <div className="mt-6">
        <ChatThread matchId={id} personName={conversation.person.displayName} initialMessages={conversation.messages} />
      </div>
      <div className="mt-4">
        <UnmatchPanel matchId={id} personName={conversation.person.displayName} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/ChatThread";
import { UnmatchPanel } from "@/components/UnmatchPanel";
import { ApiError, authedApi } from "@/lib/api";
import type { ChatThread as Thread } from "@/lib/types";

export const metadata: Metadata = { title: "Chat" };

async function loadThread(id: string): Promise<Thread> {
  try {
    return await authedApi<Thread>(`/chats/${encodeURIComponent(id)}/messages`);
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404].includes(error.status)) notFound();
    throw error;
  }
}

export default async function ChatPage({ params }: PageProps<"/chats/[id]">) {
  const { id } = await params;
  const thread = await loadThread(id);

  return (
    <>
      <Link href="/chats" className="text-sm text-muted hover:text-foreground">
        All chats
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{thread.person.displayName}</h1>
      <div className="mt-6">
        <ChatThread matchId={id} personName={thread.person.displayName} initialMessages={thread.messages} />
      </div>
      <div className="mt-4">
        <UnmatchPanel matchId={id} personName={thread.person.displayName} />
      </div>
    </>
  );
}

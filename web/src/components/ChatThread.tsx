"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/actions/chats";
import { useServerAction } from "@/lib/action-client";
import { SessionExpiredError, fetchMessages } from "@/lib/fetchers";
import { mergeMessages } from "@/lib/messages";
import type { ChatMessage } from "@/lib/types";
import { ErrorMessage } from "./ErrorMessage";

const FALLBACK_POLL_MS = 10_000;

interface ChatThreadProps {
  matchId: string;
  personName: string;
  initialMessages: ChatMessage[];
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function ChatThread({ matchId, personName, initialMessages }: ChatThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const { pending: sending, error, run } = useServerAction();
  const [closed, setClosed] = useState(false);
  const latest = useRef(initialMessages.at(-1)?.createdAt);
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => {
    latest.current = messages.at(-1)?.createdAt;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    let active = true;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const catchUp = () =>
      fetchMessages(matchId, latest.current)
        .then((fresh) => {
          if (active) setMessages((current) => mergeMessages(current, fresh));
        })
        .catch((error: unknown) => {
          if (active && error instanceof SessionExpiredError) router.replace("/session/expired");
        });

    const source = new EventSource(`/api/chats/${encodeURIComponent(matchId)}/stream`);
    source.addEventListener("open", catchUp);
    source.addEventListener("message", (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ChatMessage;
      if (active) setMessages((current) => mergeMessages(current, [message]));
    });
    source.addEventListener("closed", () => {
      source.close();
      if (active) setClosed(true);
    });
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED && !fallback) {
        fallback = setInterval(catchUp, FALLBACK_POLL_MS);
      }
    });

    return () => {
      active = false;
      source.close();
      clearInterval(fallback);
    };
  }, [matchId, router]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    run(
      () => sendMessage(matchId, body),
      (sent) => setMessages((current) => mergeMessages(current, [sent])),
      () => setDraft((typed) => typed || body),
    );
  }

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface">
      <ol
        className="flex max-h-[60vh] min-h-64 flex-col gap-2 overflow-y-auto p-4"
        aria-label={`Conversation with ${personName}`}
      >
        {messages.length === 0 && (
          <li className="m-auto text-center text-sm text-muted">You both said yes. Say hi to {personName}.</li>
        )}
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
              message.fromMe ? "self-end bg-foreground text-background" : "self-start bg-line"
            }`}
          >
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
            <time
              dateTime={message.createdAt}
              suppressHydrationWarning
              className="mt-0.5 block text-right text-xs opacity-60"
            >
              {timeFormat.format(new Date(message.createdAt))}
            </time>
          </li>
        ))}
        <li ref={bottom} aria-hidden="true" />
      </ol>

      {closed ? (
        <p role="status" className="border-t border-line p-4 text-center text-sm text-muted">
          This conversation has been closed.
        </p>
      ) : (
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={`Message ${personName}`}
            aria-label="Message"
            className="h-11 flex-1 rounded-lg border border-line bg-background px-3 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-11 rounded-lg bg-foreground px-4 font-medium text-background disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
      <ErrorMessage message={error} className="px-4 pb-3" />
    </section>
  );
}

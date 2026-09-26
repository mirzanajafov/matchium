"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { fetchMessages, sendMessage } from "@/app/actions";
import type { ChatMessage } from "@/lib/types";

const FALLBACK_POLL_MS = 10_000;

interface ChatThreadProps {
  matchId: string;
  personName: string;
  initialMessages: ChatMessage[];
}

export function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function ChatThread({ matchId, personName, initialMessages }: ChatThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [closed, setClosed] = useState(false);
  const latest = useRef(initialMessages.at(-1)?.createdAt);
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => {
    latest.current = messages.at(-1)?.createdAt;
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages]);

  useEffect(() => {
    let active = true;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const catchUp = () =>
      fetchMessages(matchId, latest.current)
        .then((fresh) => {
          if (active && fresh.length > 0) setMessages((current) => merge(current, fresh));
        })
        .catch(() => undefined);

    const source = new EventSource(`/api/chats/${encodeURIComponent(matchId)}/stream`);
    source.addEventListener("open", catchUp);
    source.addEventListener("message", (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ChatMessage;
      if (active) setMessages((current) => merge(current, [message]));
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
  }, [matchId]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startSending(async () => {
      try {
        const result = await sendMessage(matchId, body);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setMessages((current) => merge(current, [result]));
        setDraft("");
      } catch {
        setError("Message didn't go through. Try again.");
      }
    });
  }

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface">
      <ol className="flex max-h-[60vh] min-h-64 flex-col gap-2 overflow-y-auto p-4" aria-label={`Conversation with ${personName}`}>
        {messages.length === 0 && (
          <li className="m-auto text-center text-sm text-muted">
            You both said yes. Say hi to {personName}.
          </li>
        )}
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
              message.fromMe ? "self-end bg-foreground text-background" : "self-start bg-line"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <time dateTime={message.createdAt} suppressHydrationWarning className="mt-0.5 block text-right text-xs opacity-60">
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
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  );
}

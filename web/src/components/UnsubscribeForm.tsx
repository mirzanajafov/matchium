"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { unsubscribeEmail } from "@/app/actions";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<{ done: boolean; error?: string }>({ done: false });
  const [pending, startTransition] = useTransition();

  if (state.done) {
    return (
      <p role="status" className="mt-4">
        Done. You won&apos;t get these emails anymore. You can turn them back on from{" "}
        <Link href="/me" className="font-medium underline">
          your profile
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-muted">We&apos;ll stop emailing you about new matches and unread chats.</p>
      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await unsubscribeEmail(token)))}
        className="h-11 w-full rounded-lg bg-foreground font-medium text-background disabled:opacity-40"
      >
        {pending ? "One sec..." : "Stop these emails"}
      </button>
    </div>
  );
}

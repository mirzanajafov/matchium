"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { unsubscribeEmail } from "@/actions/profile";
import { resolveAction } from "@/lib/action-client";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionResult } from "@/lib/types";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function stop() {
    setState(null);
    startTransition(async () => {
      setState(await resolveAction(unsubscribeEmail(token)));
    });
  }

  if (state?.ok) {
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        stop();
      }}
      className="mt-4 space-y-4"
    >
      <p className="text-muted">We&apos;ll stop emailing you about new matches and unread chats.</p>
      <ErrorMessage message={state?.ok === false ? state.error : null} />
      <SubmitButton pending={pending}>Stop these emails</SubmitButton>
    </form>
  );
}

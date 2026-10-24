"use client";

import Link from "next/link";
import { useActionState } from "react";
import { unsubscribeEmail } from "@/actions/profile";
import { resolveAction } from "@/lib/action-client";
import type { ActionResult } from "@/lib/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionResult | null>(
    () => resolveAction(unsubscribeEmail(token)),
    null,
  );

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
    <form action={action} className="mt-4 space-y-4">
      <p className="text-muted">We&apos;ll stop emailing you about new matches and unread chats.</p>
      <ErrorMessage message={!pending && state?.ok === false ? state.error : null} />
      <SubmitButton pending={pending}>Stop these emails</SubmitButton>
    </form>
  );
}
